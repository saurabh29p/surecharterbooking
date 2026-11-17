import '@tabler/core/dist/css/tabler.min.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/bodoni-moda/600.css';
import './styles.css';
import { createApp } from 'vue';
import App from './App.vue';
import { makeRouter } from './router';

createApp(App).use(makeRouter()).mount('#app');
