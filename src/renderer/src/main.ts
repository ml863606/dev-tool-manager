import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import Downloads from './views/Downloads.vue'
import Ports from './views/Ports.vue'
import Settings from './views/Settings.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/downloads', component: Downloads },
    { path: '/ports', component: Ports },
    { path: '/settings', component: Settings }
  ]
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
