import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      // 实时语音识别 WebSocket：必须用 ws:// 目标，且要排在 '/api' 之前
      // （Vite 的 upgrade 处理按声明顺序匹配，命中第一条即转发；http:// 目标会导致握手挂起）
      '/api/asr': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true
      }
    }
  }
});
