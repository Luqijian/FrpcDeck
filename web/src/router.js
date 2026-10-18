import { createRouter, createWebHistory } from 'vue-router';
import { init, store } from './store';
import AppShell from './components/AppShell.vue';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('./pages/LoginPage.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/change-password',
    name: 'change-password',
    component: () => import('./pages/ChangePasswordPage.vue'),
    meta: { title: '修改初始密码' },
  },
  {
    path: '/',
    component: AppShell,
    children: [
      {
        path: '',
        name: 'dashboard',
        component: () => import('./pages/DashboardPage.vue'),
        meta: { title: '概览', subtitle: 'frpc 运行状态与快捷操作' },
      },
      {
        path: 'proxies',
        name: 'proxies',
        component: () => import('./pages/ProxiesPage.vue'),
        meta: { title: '代理', subtitle: '管理所有内网穿透规则' },
      },
      {
        path: 'visitors',
        name: 'visitors',
        component: () => import('./pages/VisitorsPage.vue'),
        meta: { title: '访问器', subtitle: '连接其他 frpc 的 STCP / XTCP 服务' },
      },
      {
        path: 'connection',
        name: 'connection',
        component: () => import('./pages/ConnectionPage.vue'),
        meta: { title: '连接配置', subtitle: 'frps 地址、认证、传输与日志' },
      },
      {
        path: 'logs',
        name: 'logs',
        component: () => import('./pages/LogsPage.vue'),
        meta: { title: '运行日志', subtitle: '实时查看 frpc 输出与错误' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('./pages/SettingsPage.vue'),
        meta: { title: '设置', subtitle: '账户、运行行为、备份与系统信息' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  if (!store.ready) await init();
  if (to.meta.public) {
    if (to.name === 'login' && store.authenticated) {
      return { name: store.auth.mustChangePassword ? 'change-password' : 'dashboard' };
    }
    return true;
  }
  if (!store.authenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (store.auth.mustChangePassword && to.name !== 'change-password') {
    return { name: 'change-password' };
  }
  if (!store.auth.mustChangePassword && to.name === 'change-password') {
    return { name: 'dashboard' };
  }
  return true;
});

router.afterEach((to) => {
  const title = to.meta.title ? `${to.meta.title} · FrpcDeck` : 'FrpcDeck';
  document.title = title;
});

export default router;
