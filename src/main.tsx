import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { APP_CONFIG } from './config';
import { installFetchAuth } from './lib/api';
import 'tdesign-react/esm/style/index.js';
import './index.css';

// 安装全局 fetch 鉴权拦截器（自动注入 JWT，401 跳登录）
installFetchAuth();

// 设置页面标题
document.title = APP_CONFIG.name;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
