export const ENV = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000',
  APP_NAME: import.meta.env.VITE_APP_NAME || 'INDIUM',
  APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
}
