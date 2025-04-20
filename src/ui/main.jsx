import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  state = { hasError: false }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Component Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <div className="error-fallback">Failed to load diagram component</div>;
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found!');
  throw new Error('Missing root element');
}
console.log('Root element found:', rootElement);

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  console.log('React mounted successfully');
} catch (err) {
  console.error('React mount error:', err);
}
