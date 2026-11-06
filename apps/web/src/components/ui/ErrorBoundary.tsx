import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { useLabStore } from '../../store/useLabStore';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  resetKeys?: readonly unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

function DefaultFallback({ onReset }: { onReset: () => void }): ReactNode {
  const { t } = useI18n();
  const returnToLab = () => {
    useLabStore.getState().navigate('lab');
    onReset();
  };

  return (
    <div className="error-boundary" role="alert">
      <h2>{t('界面发生错误')}</h2>
      <p>{t('此区域遇到了问题。你可以重试，或返回工作台继续操作。')}</p>
      <div className="error-boundary-actions">
        <button className="btn small primary" onClick={onReset}>
          {t('重试')}
        </button>
        <button className="btn small" onClick={returnToLab}>
          {t('返回工作台')}
        </button>
      </div>
    </div>
  );
}

function resetKeysChanged(previous: readonly unknown[] = [], next: readonly unknown[] = []): boolean {
  return previous.length !== next.length || previous.some((key, index) => !Object.is(key, next[index]));
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('InferenceLab UI error', error, info);
  }

  override componentDidUpdate(previousProps: ErrorBoundaryProps): void {
    if (this.state.error !== null && resetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      this.setState({ error: null });
    }
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error !== null) {
      return this.props.fallback ?? <DefaultFallback onReset={this.reset} />;
    }
    return this.props.children;
  }
}
