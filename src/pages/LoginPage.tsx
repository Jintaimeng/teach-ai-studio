import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, MessagePlugin } from 'tdesign-react';
import { useAuth } from '../hooks/useAuth';
import { APP_CONFIG } from '../config';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      MessagePlugin.warning('请输入用户名和密码');
      return;
    }
    setSubmitting(true);
    try {
      const err =
        mode === 'login'
          ? await login(username.trim(), password)
          : await register(username.trim(), password, email.trim() || undefined);
      if (err) {
        MessagePlugin.error(err);
        return;
      }
      MessagePlugin.success(mode === 'login' ? '登录成功' : '注册成功');
      navigate('/', { replace: true });
    } catch (e: any) {
      MessagePlugin.error(e?.message || '请求失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ background: 'var(--td-bg-color-page)' }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-xl"
        style={{
          background: 'var(--td-bg-color-container)',
          boxShadow: 'var(--td-shadow-2)',
        }}
      >
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-lg mb-3 text-white text-xl font-bold"
            style={{ background: 'var(--td-brand-color)' }}
          >
            {APP_CONFIG.nameInitial}
          </div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
            {APP_CONFIG.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--td-text-color-secondary)' }}>
            {mode === 'login' ? '登录以继续' : '创建新账号'}
          </p>
        </div>

        <div className="space-y-3">
          <Input
            value={username}
            onChange={(v) => setUsername(v as string)}
            placeholder="用户名（3-32 位字母数字下划线）"
            size="large"
            onEnter={handleSubmit}
          />
          <Input
            type="password"
            value={password}
            onChange={(v) => setPassword(v as string)}
            placeholder="密码（至少 6 位）"
            size="large"
            onEnter={handleSubmit}
          />
          {mode === 'register' && (
            <Input
              value={email}
              onChange={(v) => setEmail(v as string)}
              placeholder="邮箱（可选）"
              size="large"
              onEnter={handleSubmit}
            />
          )}

          <Button theme="primary" block size="large" loading={submitting} onClick={handleSubmit}>
            {mode === 'login' ? '登录' : '注册并登录'}
          </Button>
        </div>

        <div className="text-center mt-4 text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
          {mode === 'login' ? (
            <>
              还没有账号？{' '}
              <a className="cursor-pointer" style={{ color: 'var(--td-brand-color)' }} onClick={() => setMode('register')}>
                去注册
              </a>
            </>
          ) : (
            <>
              已有账号？{' '}
              <a className="cursor-pointer" style={{ color: 'var(--td-brand-color)' }} onClick={() => setMode('login')}>
                去登录
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
