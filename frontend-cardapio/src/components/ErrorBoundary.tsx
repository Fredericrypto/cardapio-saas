import { Component, type ReactNode } from 'react';

// Rede de segurança pra QUALQUER erro de renderização não tratado em
// qualquer lugar do app. Antes disso, um erro assim derrubava o React
// inteiro e deixava a tela completamente branca, sem nenhum jeito de
// voltar — nem o botão "voltar" do celular resolvia, porque o app
// tinha travado de vez.
//
// Isso não CORRIGE o erro em si (o bug real que travou algo continua
// existindo, precisa achar e consertar sempre que reaparecer), mas
// garante que o cliente sempre tem uma saída: recarregar a página.
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary capturou um erro:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-3 px-6 text-center bg-gray-50">
          <p className="text-sm text-gray-600">
            Ops, algo deu errado ao carregar essa tela.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.href = '/';
            }}
            className="text-sm font-semibold bg-gray-900 text-white px-4 py-2 rounded-lg"
          >
            Voltar ao início
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
