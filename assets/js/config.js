/**
 * Qtine 文档站配置
 * 纯前端方案 —— 侧边栏 / 导航 / 主题种子
 */
window.QTINE_DOCS_CONFIG = {
  // 站点元信息
  site: {
    title: 'Qtine',
    subtitle: '模块化聊天机器人框架',
    description: '轻量、可扩展、开箱即用',
    logo: '/docs/public/logo.png',
    favicon: '/docs/public/favicon.svg',
    repo: 'https://github.com/QtineNiko/Qtine',
    version: 'v1.1.0',
  },

  // 顶部导航
  nav: [
    { text: '指南', link: '/guide/what-is-qtine', match: '/guide/' },
    { text: '配置', link: '/config/basic', match: '/config/' },
    { text: '命令', link: '/commands/user', match: '/commands/' },
    { text: '开发', link: '/develop/plugin', match: '/develop/' },
    { text: 'GitHub', link: 'external:https://github.com/QtineNiko/Qtine', external: true },
  ],

  // 侧边栏分组（按路径前缀匹配）
  sidebar: {
    '/guide/': [
      {
        title: '开始',
        items: [
          { text: 'Qtine 是什么', link: '/guide/what-is-qtine' },
          { text: '快速开始', link: '/guide/quick-start' },
          { text: '对接 NapCat', link: '/guide/connect-napcat' },
        ],
      },
      {
        title: '基础',
        items: [
          { text: '目录结构', link: '/guide/structure' },
          { text: 'WebUI 面板', link: '/guide/webui' },
          { text: '插件管理', link: '/guide/plugin-manage' },
          { text: '适配器管理', link: '/guide/adapter-manage' },
        ],
      },
      {
        title: '进阶',
        items: [
          { text: '架构设计', link: '/guide/architecture' },
          { text: '消息管道', link: '/guide/pipeline' },
          { text: '事件总线', link: '/guide/event-bus' },
          { text: '存储后端', link: '/guide/storage' },
          { text: '权限系统', link: '/guide/permission' },
          { text: '频率限制', link: '/guide/rate-limit' },
        ],
      },
      {
        title: '部署',
        items: [
          { text: 'Docker 部署', link: '/guide/docker' },
          { text: '反向代理', link: '/guide/reverse-proxy' },
        ],
      },
      {
        title: '其他',
        items: [
          { text: 'FAQ 常见问题', link: '/guide/faq' },
          { text: '更新日志', link: '/guide/changelog' },
        ],
      },
    ],
    '/config/': [
      {
        title: '配置参考',
        items: [
          { text: '基础配置', link: '/config/basic' },
          { text: '适配器配置', link: '/config/adapter' },
          { text: '安全配置', link: '/config/security' },
          { text: '存储配置', link: '/config/storage' },
          { text: '日志配置', link: '/config/logging' },
          { text: 'WebUI 配置', link: '/config/webui' },
        ],
      },
    ],
    '/commands/': [
      {
        title: '命令列表',
        items: [
          { text: '用户命令', link: '/commands/user' },
          { text: '管理员命令', link: '/commands/admin' },
          { text: '插件命令', link: '/commands/plugin' },
        ],
      },
    ],
    '/develop/': [
      {
        title: '开发指南',
        items: [
          { text: '插件开发', link: '/develop/plugin' },
          { text: '适配器开发', link: '/develop/adapter' },
          { text: 'API 接口', link: '/develop/api' },
        ],
      },
    ],
  },

  // 首页路由（访问 / 时展示 index.md）
  home: '/index',

  // MD3 主题种子色（Material You 动态色调基色）
  themeSeed: '#6750A4',

  // 社交链接
  socialLinks: [
    { icon: 'github', link: 'https://github.com/QtineNiko/Qtine' },
  ],

  // 页脚
  footer: {
    message: '基于 MIT 协议发布',
    copyright: '版权所有 © 2025 Qtine 开发团队',
  },
};
