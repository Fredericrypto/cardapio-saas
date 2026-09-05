import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // `host: true` escuta em 0.0.0.0, não só localhost — sem isso, o
    // celular na mesma rede Wi-Fi nunca alcança o servidor de dev,
    // mesmo com o IP certo. Necessário pra testar no celular via
    // túnel/rede local.
    host: true,
  },
})
