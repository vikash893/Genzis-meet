import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the landing page for the app', () => {
  render(<App />);
  expect(screen.getByText(/Video calls and meetings for everyone/i)).toBeInTheDocument();
});
