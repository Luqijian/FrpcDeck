import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { applyTheme, store } from './store';
import './styles/main.css';

applyTheme(store.theme);

createApp(App).use(router).mount('#app');
