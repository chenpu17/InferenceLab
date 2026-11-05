import { create } from 'zustand';
import {
  createEmptyViewState,
  parseCalibrationBundle,
  validateScenarioStructure,
  type CalibrationCurve,
  type PlanResult,
  type Scenario,
  type SimViewState,
  type SimulationResult,
  type ValidationIssue,
} from '@inferencelab/core';
import { parseStandardTrace, applyTraceToScenario, type TraceImportResult } from '@inferencelab/adapters';
import { cloneScenario, getScenarioPreset, scenarioPresets } from '@inferencelab/profiles';
import type { EntityRef } from '../lib/entities';
import { sameEntity } from '../lib/entities';
import { clearReplayIndex, getReplayIndex } from '../lib/replay';
import { nextEventOfType } from '../lib/timeline';
import {
  createInitialScenario,
  hardwareFor,
  isPdScenario,
  modelFor,
  pdDimsOf,
  withFixedWorkload,
  withHardware,
  withMixedDp,
  withMixedTp,
  withModel,
  withPdDims,
  withKvTransferStrategy,
  withRuntime,
} from '../lib/scenario';
import { simulationClient } from '../worker/client';
import type { Locale } from '../i18n/types';

export type Route = 'lab' | 'experiments' | 'reference';
export type Lens = 'topology' | 'memory' | 'scheduler' | 'transport' | 'metrics';
export type Mode = 'explore' | 'experiment' | 'replay';
export type PlanStatus = 'idle' | 'planning' | 'ready' | 'invalid' | 'unknown';
export type QualityTier = 'synthetic' | 'measured' | 'unknown';
export type Theme = 'dark' | 'light';
export type PlaybackSpeed = 0.25 | 1 | 4 | 16;

export interface ExperimentRecord {
  id: string;
  label: string;
  createdAt: string;
  scenario: Scenario;
  result: SimulationResult;
  revision: number;
}

export interface OnboardingState {
  open: boolean;
  step: number;
  completed: boolean;
}

export interface DrawerState {
  config: boolean;
  inspector: boolean;
  timeline: boolean;
}

interface LabState {
  route: Route;
  mode: Mode;
  activeLens: Lens;
  selectedEntity: EntityRef | null;
  focusPath: EntityRef[];
  scenario: Scenario;
  presetId: string | null;
  draftRevision: number;
  draftDirty: boolean;
  planPreview: PlanResult | null;
  planStatus: PlanStatus;
  planIssues: ValidationIssue[];
  activeRun: SimulationResult | null;
  activeRunId: string | null;
  runHistory: ExperimentRecord[];
  eventIndex: number;
  virtualTimeUs: number;
  viewState: SimViewState | null;
  playing: boolean;
  playbackSpeed: PlaybackSpeed;
  qualityTier: QualityTier;
  theme: Theme;
  locale: Locale;
  reducedMotion: boolean;
  running: boolean;
  runError: string | null;
  runErrorCode: string | null;
  onboarding: OnboardingState;
  drawers: DrawerState;
  showLegend: boolean;
  calibrationCurves: CalibrationCurve[];
  calibrationIssues: ValidationIssue[];
  traceInfo: TraceImportResult | null;

  navigate: (route: Route) => void;
  setMode: (mode: Mode) => void;
  setLens: (lens: Lens) => void;
  selectEntity: (entity: EntityRef | null, options?: { focus?: boolean; lens?: Lens }) => void;
  clearFocus: () => void;
  loadPreset: (presetId: string) => void;
  patchScenario: (next: Scenario, options?: { dirty?: boolean }) => void;
  setTp: (tp: number) => void;
  setDp: (dp: number) => void;
  setPdDims: (dims: Partial<{ prefillTp: number; prefillDp: number; decodeTp: number; decodeDp: number }>) => void;
  setKvTransferStrategy: (strategy: 'PD_PULL' | 'PD_LAYERWISE_PUSH' | 'PD_HOST_STAGING') => void;
  setHardware: (hardwareId: string) => void;
  setModel: (modelId: string) => void;
  setRuntime: (patch: Partial<Scenario['runtime']>) => void;
  setWorkloadFixed: (patch: Partial<Extract<Scenario['workload'], { kind: 'fixed' }>>) => void;
  restoreDraftToRun: () => void;
  planNow: () => Promise<void>;
  runNow: (allowUnknown?: boolean) => Promise<void>;
  dismissRunError: () => void;
  advanceTo: (index: number, pause?: boolean) => void;
  setEventIndex: (index: number) => void;
  setVirtualTime: (us: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepEvent: () => void;
  stepIteration: () => void;
  resetPlayback: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  selectRun: (runId: string) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  setReducedMotion: (value: boolean) => void;
  toggleDrawer: (drawer: keyof DrawerState) => void;
  toggleLegend: () => void;
  setOnboarding: (state: Partial<OnboardingState>) => void;
  resetOnboarding: () => void;
  importCalibrationCurves: (input: unknown) => ValidationIssue[];
  clearCalibrationCurves: () => void;
  importTrace: (input: unknown) => ValidationIssue[];
}

const DRAFT_KEY = 'inferencelab.draft.v1';
const PREF_KEY = 'inferencelab.prefs.v1';

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('experiments')) return 'experiments';
  if (hash.startsWith('reference')) return 'reference';
  return 'lab';
}

function loadPersistedDraft(): Scenario | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const structural = validateScenarioStructure(parsed);
    return structural.ok ? structural.scenario : null;
  } catch {
    return null;
  }
}

function loadPreferences(): { theme: Theme; reducedMotion: boolean; locale: Locale } {
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const queryLocale = new URLSearchParams(window.location.search).get('lang');
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { theme?: Theme; reducedMotion?: boolean; locale?: Locale };
      return {
        theme: parsed.theme === 'light' ? 'light' : 'dark',
        reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : media,
        locale: queryLocale === 'en' || queryLocale === 'zh'
          ? queryLocale
          : parsed.locale === 'en' ? 'en' : 'zh',
      };
    }
  } catch {
    // ignore
  }
  return {
    theme: 'dark',
    reducedMotion: media,
    locale: queryLocale === 'en' || queryLocale === 'zh' ? queryLocale : 'zh',
  };
}

function savePreferences(theme: Theme, reducedMotion: boolean, locale: Locale): void {
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify({ theme, reducedMotion, locale }));
  } catch {
    // ignore
  }
}

let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveDraftLater(scenario: Scenario): void {
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(scenario));
    } catch {
      // ignore
    }
  }, 350);
}

let planTimer: ReturnType<typeof setTimeout> | null = null;
let planSequence = 0;
function schedulePlan(delay = 160): void {
  if (planTimer) clearTimeout(planTimer);
  planTimer = setTimeout(() => {
    planTimer = null;
    void useLabStore.getState().planNow();
  }, delay);
}

function deriveQualityTier(scenario: Scenario, plan: PlanResult | null, result: SimulationResult | null): QualityTier {
  const hardware = hardwareFor(scenario);
  const model = modelFor(scenario);
  if (plan?.feasibility === 'unknown') return 'unknown';
  if (hardware?.provenance.kind === 'unknown' || model?.provenance.kind === 'unknown') return 'unknown';
  // Imported trace observations are measured, but they do not make the simulated
  // stage timings measured. Only a calibrated simulation metric upgrades the run.
  if (result?.metrics.some((metric) => metric.quality === 'calibrated' && metric.group !== 'observed')) {
    return 'measured';
  }
  return 'synthetic';
}

function planStatusOf(plan: PlanResult): PlanStatus {
  if (plan.feasibility === 'feasible') return 'ready';
  if (plan.feasibility === 'unknown') return 'unknown';
  return 'invalid';
}

function makeRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

const persisted = loadPersistedDraft();
const preferences = loadPreferences();
const initialScenario = persisted ?? createInitialScenario();

export const useLabStore = create<LabState>((set, get) => ({
  route: readRoute(),
  mode: 'explore',
  activeLens: 'topology',
  selectedEntity: null,
  focusPath: [],
  scenario: initialScenario,
  presetId: persisted ? null : 'toy-32gpu-tp16-dp2',
  draftRevision: 1,
  draftDirty: false,
  planPreview: null,
  planStatus: 'idle',
  planIssues: [],
  activeRun: null,
  activeRunId: null,
  runHistory: [],
  eventIndex: 0,
  virtualTimeUs: 0,
  viewState: null,
  playing: false,
  playbackSpeed: 1,
  qualityTier: 'synthetic',
  theme: preferences.theme,
  locale: preferences.locale,
  reducedMotion: preferences.reducedMotion,
  running: false,
  runError: null,
  runErrorCode: null,
  onboarding: { open: true, step: 0, completed: false },
  drawers: { config: false, inspector: false, timeline: false },
  showLegend: false,
  calibrationCurves: [],
  calibrationIssues: [],
  traceInfo: null,

  navigate: (route) => {
    set({ route });
    const target = `#/${route}`;
    if (window.location.hash !== target) window.location.hash = target;
  },

  setMode: (mode) => set({ mode }),

  setLens: (lens) => set({ activeLens: lens }),

  selectEntity: (entity, options) => {
    const state = get();
    const nextLens = options?.lens ?? state.activeLens;
    if (!entity || entity.kind === 'none') {
      set({ selectedEntity: null, activeLens: nextLens });
      return;
    }
    const focusPath = options?.focus
      ? [...state.focusPath.filter((item) => !sameEntity(item, entity)), entity]
      : state.focusPath;
    set({ selectedEntity: entity, activeLens: nextLens, focusPath });
  },

  clearFocus: () => set({ focusPath: [] }),

  loadPreset: (presetId) => {
    const preset = getScenarioPreset(presetId) ?? scenarioPresets.find((item) => item.id === presetId);
    if (!preset) return;
    const scenario = cloneScenario(preset.scenario);
    clearReplayIndex();
    set({
      scenario,
      presetId: preset.id,
      draftRevision: get().draftRevision + 1,
      draftDirty: true,
      planStatus: 'planning',
      planPreview: null,
      planIssues: [],
      activeRun: null,
      activeRunId: null,
      eventIndex: 0,
      virtualTimeUs: 0,
      viewState: null,
      playing: false,
      selectedEntity: null,
      focusPath: [],
      mode: 'explore',
      runError: null,
      runErrorCode: null,
    });
    saveDraftLater(scenario);
    schedulePlan(30);
  },

  patchScenario: (next, options) => {
    set({
      scenario: next,
      presetId: null,
      draftRevision: get().draftRevision + 1,
      draftDirty: options?.dirty ?? true,
      planStatus: 'planning',
      planIssues: [],
      runError: null,
      runErrorCode: null,
    });
    saveDraftLater(next);
    schedulePlan();
  },

  setTp: (tp) => {
    const result = withMixedTp(get().scenario, tp);
    if (result.issues.some((issue) => issue.severity === 'error')) {
      set({ planIssues: result.issues, planStatus: 'invalid' });
      return;
    }
    get().patchScenario(result.scenario);
  },

  setDp: (dp) => {
    const result = withMixedDp(get().scenario, dp);
    if (result.issues.some((issue) => issue.severity === 'error')) {
      set({ planIssues: result.issues, planStatus: 'invalid' });
      return;
    }
    get().patchScenario(result.scenario);
  },

  setPdDims: (dims) => {
    const result = withPdDims(get().scenario, dims);
    if (result.issues.some((issue) => issue.severity === 'error')) {
      set({ planIssues: result.issues, planStatus: 'invalid' });
      return;
    }
    get().patchScenario(result.scenario);
  },

  setKvTransferStrategy: (strategy) => {
    get().patchScenario(withKvTransferStrategy(get().scenario, strategy));
  },

  setHardware: (hardwareId) => {
    const result = withHardware(get().scenario, hardwareId);
    if (result.issues.some((issue) => issue.severity === 'error')) {
      set({ planIssues: result.issues, planStatus: 'invalid' });
      return;
    }
    get().patchScenario(result.scenario);
  },

  setModel: (modelId) => {
    get().patchScenario(withModel(get().scenario, modelId));
  },

  setRuntime: (patch) => {
    get().patchScenario(withRuntime(get().scenario, patch));
  },

  setWorkloadFixed: (patch) => {
    get().patchScenario(withFixedWorkload(get().scenario, patch));
  },

  restoreDraftToRun: () => {
    const run = get().activeRun;
    if (!run) return;
    const scenario = cloneScenario(run.scenario);
    set({
      scenario,
      presetId: null,
      draftRevision: get().draftRevision + 1,
      draftDirty: false,
      planPreview: run.plan,
      planStatus: planStatusOf(run.plan),
      planIssues: run.plan.issues,
      runError: null,
      runErrorCode: null,
    });
    saveDraftLater(scenario);
    schedulePlan(30);
  },

  planNow: async () => {
    const sequence = ++planSequence;
    const revision = get().draftRevision;
    const scenario = get().scenario;
    set({ planStatus: 'planning' });
    try {
      const response = await simulationClient.plan(scenario);
      if (sequence !== planSequence || revision !== get().draftRevision) return;
      if (!response.ok) {
        set({ planPreview: null, planStatus: 'invalid', planIssues: response.issues });
        return;
      }
      set({
        planPreview: response.plan,
        planStatus: planStatusOf(response.plan),
        planIssues: response.issues,
        qualityTier: deriveQualityTier(scenario, response.plan, get().activeRun),
      });
    } catch (error) {
      if (sequence !== planSequence) return;
      set({
        planPreview: null,
        planStatus: 'invalid',
        planIssues: [
          {
            severity: 'error',
            code: 'PLAN_WORKER_FAILED',
            path: 'worker',
            message: error instanceof Error ? error.message : String(error),
            suggestedFix: '刷新页面；若仍失败，检查浏览器是否支持 module Worker。',
          },
        ],
      });
    }
  },

  runNow: async (allowUnknown = false) => {
    const state = get();
    if (state.running) return;
    if (state.planStatus === 'invalid') {
      set({ runError: '当前 Plan 不可行，请先修复错误后再运行。', runErrorCode: 'INVALID' });
      return;
    }
    if (state.planStatus === 'unknown' && !allowUnknown) {
      set({
        runError: 'Plan 为 unknown。请选择“仅结构查看”或“使用已标注合成参数模拟”。',
        runErrorCode: 'UNKNOWN_REQUIRES_CONSENT',
      });
      return;
    }
    let scenario = state.scenario;
    if (state.planStatus === 'unknown' && allowUnknown && scenario.assumptions.allowSyntheticTiming !== true) {
      scenario = cloneScenario(scenario);
      scenario.assumptions = { ...scenario.assumptions, allowSyntheticTiming: true };
      set({ scenario, draftDirty: true });
    }
    const revision = get().draftRevision;
    set({ running: true, playing: false, runError: null, runErrorCode: null });
    try {
      const result = await simulationClient.run(scenario, {
        calibrationCurves: get().calibrationCurves.length > 0 ? get().calibrationCurves : undefined,
      });
      performance.mark('il-run-response-received');
      const record: ExperimentRecord = {
        id: makeRunId(),
        label: `${result.scenario.title} · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`,
        createdAt: new Date().toISOString(),
        scenario: cloneScenario(result.scenario),
        result,
        revision,
      };
      clearReplayIndex();
      // A run can finish after the user has edited the Draft. The run belongs
      // to the revision captured at start; never overwrite a newer Draft's
      // plan preview or dirty flag with the frozen run's plan.
      const draftUnchanged = get().draftRevision === revision;
      set({
        activeRun: result,
        activeRunId: record.id,
        runHistory: [record, ...get().runHistory].slice(0, 12),
        ...(draftUnchanged
          ? {
              planPreview: result.plan,
              planStatus: planStatusOf(result.plan),
              planIssues: result.plan.issues,
              draftDirty: false,
            }
          : {}),
        eventIndex: 0,
        virtualTimeUs: 0,
        viewState: createEmptyViewState(result.plan),
        playing: !get().reducedMotion,
        running: false,
        mode: 'experiment',
        qualityTier: deriveQualityTier(scenario, result.plan, result),
        selectedEntity: get().selectedEntity ?? defaultSelection(result),
      });
      performance.mark('il-run-state-set');
    } catch (error) {
      const code = (error as Error & { code?: string }).code ?? null;
      set({
        running: false,
        runError: error instanceof Error ? error.message : String(error),
        runErrorCode: code,
      });
    }
  },

  dismissRunError: () => set({ runError: null, runErrorCode: null }),

  advanceTo: (index, pause = true) => {
    const state = get();
    if (!state.activeRun || !state.activeRunId) return;
    const total = state.activeRun.events.length;
    const target = Math.max(0, Math.min(total, Math.floor(index)));
    const replay = getReplayIndex(
      state.activeRunId,
      state.activeRun.events,
      state.activeRun.plan,
      state.activeRun.replayCheckpoints,
    );
    const viewState = replay.stateAt(target);
    set({
      eventIndex: target,
      virtualTimeUs: viewState.timeUs,
      viewState,
      playing: pause ? false : state.playing,
    });
  },

  setEventIndex: (index) => {
    get().advanceTo(index, true);
  },

  setVirtualTime: (us) => {
    const state = get();
    if (!state.activeRun || !state.activeRunId) return;
    const replay = getReplayIndex(
      state.activeRunId,
      state.activeRun.events,
      state.activeRun.plan,
      state.activeRun.replayCheckpoints,
    );
    const index = replay.eventIndexAtOrBeforeTime(us);
    get().advanceTo(index, true);
  },

  play: () => {
    const state = get();
    if (!state.activeRun) return;
    if (state.eventIndex >= state.activeRun.events.length) {
      get().advanceTo(0, false);
    }
    set({ playing: true });
  },

  pause: () => set({ playing: false }),

  togglePlay: () => {
    if (get().playing) get().pause();
    else get().play();
  },

  stepEvent: () => {
    const state = get();
    if (!state.activeRun) return;
    get().advanceTo(Math.min(state.eventIndex + 1, state.activeRun.events.length), true);
  },

  stepIteration: () => {
    const state = get();
    if (!state.activeRun) return;
    const next = nextEventOfType(state.activeRun.events, state.eventIndex, 'SCHEDULE_TICK');
    get().advanceTo(next, true);
  },

  resetPlayback: () => {
    get().advanceTo(0, true);
  },

  setSpeed: (speed) => set({ playbackSpeed: speed }),

  selectRun: (runId) => {
    const record = get().runHistory.find((item) => item.id === runId);
    if (!record) return;
    clearReplayIndex();
    const result = record.result;
    set({
      activeRun: result,
      activeRunId: record.id,
      planPreview: result.plan,
      planStatus: planStatusOf(result.plan),
      planIssues: result.plan.issues,
      eventIndex: 0,
      virtualTimeUs: 0,
      viewState: createEmptyViewState(result.plan),
      playing: false,
      selectedEntity: defaultSelection(result),
      focusPath: [],
      mode: 'experiment',
      qualityTier: deriveQualityTier(record.scenario, result.plan, result),
    });
  },

  setTheme: (theme) => {
    set({ theme });
    savePreferences(theme, get().reducedMotion, get().locale);
  },

  toggleTheme: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(theme);
  },

  setLocale: (locale) => {
    set({ locale });
    savePreferences(get().theme, get().reducedMotion, locale);
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  },

  setReducedMotion: (value) => {
    set({ reducedMotion: value, playing: value ? false : get().playing });
    savePreferences(get().theme, value, get().locale);
  },

  toggleDrawer: (drawer) => {
    set({ drawers: { ...get().drawers, [drawer]: !get().drawers[drawer] } });
  },

  toggleLegend: () => set({ showLegend: !get().showLegend }),

  setOnboarding: (patch) => set({ onboarding: { ...get().onboarding, ...patch } }),

  resetOnboarding: () => set({ onboarding: { open: true, step: 0, completed: false } }),

  importCalibrationCurves: (input) => {
    const parsed = parseCalibrationBundle(input);
    set({
      calibrationCurves: parsed.ok ? parsed.curves : get().calibrationCurves,
      calibrationIssues: parsed.issues,
    });
    return parsed.issues;
  },

  clearCalibrationCurves: () => set({ calibrationCurves: [], calibrationIssues: [] }),

  importTrace: (input) => {
    const parsed = parseStandardTrace(input);
    set({ traceInfo: parsed });
    if (!parsed.ok) return parsed.issues;
    const scenario = applyTraceToScenario(get().scenario, parsed);
    get().patchScenario(scenario, { dirty: true });
    set({ mode: 'replay' });
    return parsed.issues;
  },
}));

function defaultSelection(result: SimulationResult): EntityRef | null {
  const first = result.plan.resolvedRanks[0];
  if (!first) return null;
  return { kind: 'device', id: first.acceleratorId, label: `设备 ${first.acceleratorId}` };
}

export function currentParallelismLabel(scenario: Scenario): string {
  if (isPdScenario(scenario)) {
    const dims = pdDimsOf(scenario);
    return `P${dims.prefillTp}×${dims.prefillDp} + D${dims.decodeTp}×${dims.decodeDp}`;
  }
  const tp = scenario.deployment.logicalParallelism.tp ?? 1;
  const dp = scenario.deployment.logicalParallelism.dp ?? 1;
  return `TP${tp} × DP${dp}`;
}

export { scenarioPresets };
