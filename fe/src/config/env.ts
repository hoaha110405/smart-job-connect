
export const ENV = {
  // Fix: Property 'env' does not exist on 'ImportMeta'. Using process.env to access environment variables.
  API_BASE_URL: (process.env.VITE_API_BASE_URL as string) || 'https://diarchic-elanor-unsurrealistically.ngrok-free.dev',
};
