# SSH Manage

一个极客风格的 SSH Web 客户端，支持多标签页管理和连接历史保存。

![SSH Manage](https://img.shields.io/badge/SSH-Manage-00ff88?style=for-the-badge&logo=terminal&logoColor=white)

## ✨ 功能特性

- 🖥️ **Web 终端** - 基于 xterm.js 的完整终端模拟
- 🏷️ **多标签页** - 同时管理多个 SSH 连接
- 💾 **连接历史** - 自动保存连接信息，一键快速连接
- 🎨 **极客风格** - 深黑背景 + 霓虹色主题
- 🔒 **密码认证** - 支持用户名/密码方式连接

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vite + Vanilla JS |
| 终端 | xterm.js |
| 后端 | Node.js + Express |
| SSH | ssh2 |
| 通信 | WebSocket |

## 📦 安装

```bash
# 克隆项目
git clone https://github.com/fuguimashu/ssh-manage.git
cd ssh-manage

# 安装依赖
npm install
```

## 🚀 启动

```bash
# 开发模式（同时启动前端和后端）
npm run dev

# 仅启动后端
npm run server

# 仅启动前端
npm run client

# 生产构建
npm run build
```

启动后访问：http://localhost:5173

## 📁 项目结构

```
ssh-manage/
├── package.json          # 项目配置
├── vite.config.js        # Vite 配置
├── index.html            # 主页面
├── server/
│   ├── index.js          # Express + WebSocket 服务器
│   └── ssh-manager.js    # SSH 连接管理
└── src/
    ├── main.js           # 前端入口
    ├── styles/
    │   └── index.css     # 极客风格主题
    ├── components/
    │   ├── TabManager.js     # 标签页管理
    │   ├── Terminal.js       # 终端组件
    │   ├── ConnectForm.js    # 连接表单
    │   └── HistoryManager.js # 历史记录管理
    └── utils/
        └── websocket.js  # WebSocket 客户端
```

## 🎯 使用方法

1. 点击 **+** 按钮打开连接面板
2. 输入主机地址、端口、用户名、密码
3. 点击 **CONNECT** 建立连接
4. 连接成功后自动保存到历史记录
5. 下次可从历史记录一键快速连接

## 🖼️ 界面预览

- 深黑色背景配霓虹绿/青色高亮
- 扫描线视觉效果
- 终端风格字体 (JetBrains Mono)
- 发光边框和动画效果

## 📝 License

MIT

## 🙏 致谢

- [xterm.js](https://xtermjs.org/) - 终端模拟
- [ssh2](https://github.com/mscdex/ssh2) - SSH 客户端
- [Vite](https://vitejs.dev/) - 前端构建工具
