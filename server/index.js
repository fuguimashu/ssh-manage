import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { SSHManager } from './ssh-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// 存储所有活跃的 SSH 会话
const sessions = new Map();

// 静态文件服务（生产环境）
app.use(express.static(join(__dirname, '../dist')));

// WebSocket 连接处理
wss.on('connection', (ws) => {
    console.log('[WS] 新客户端连接');

    let sshManager = null;
    let sessionId = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
                case 'connect':
                    // 创建新的 SSH 连接
                    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    sshManager = new SSHManager();

                    console.log(`[SSH] 尝试连接: ${data.username}@${data.host}:${data.port}`);

                    sshManager.on('ready', () => {
                        console.log(`[SSH] 连接成功: ${sessionId}`);
                        sessions.set(sessionId, { ws, sshManager });
                        ws.send(JSON.stringify({
                            type: 'connected',
                            sessionId,
                            message: `已连接到 ${data.host}`
                        }));
                    });

                    sshManager.on('data', (data) => {
                        ws.send(JSON.stringify({
                            type: 'data',
                            data: data.toString('utf8')
                        }));
                    });

                    sshManager.on('close', () => {
                        console.log(`[SSH] 连接关闭: ${sessionId}`);
                        ws.send(JSON.stringify({
                            type: 'disconnected',
                            sessionId
                        }));
                        sessions.delete(sessionId);
                    });

                    sshManager.on('error', (err) => {
                        console.error(`[SSH] 错误: ${err.message}`);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: err.message
                        }));
                    });

                    try {
                        await sshManager.connect({
                            host: data.host,
                            port: data.port || 22,
                            username: data.username,
                            password: data.password
                        });
                    } catch (err) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: `连接失败: ${err.message}`
                        }));
                    }
                    break;

                case 'data':
                    // 发送数据到 SSH
                    if (sshManager && sshManager.isConnected()) {
                        sshManager.write(data.data);
                    }
                    break;

                case 'resize':
                    // 调整终端大小
                    if (sshManager && sshManager.isConnected()) {
                        sshManager.resize(data.cols, data.rows);
                    }
                    break;

                case 'disconnect':
                    // 断开 SSH 连接
                    if (sshManager) {
                        sshManager.disconnect();
                        sshManager = null;
                    }
                    break;
            }
        } catch (err) {
            console.error('[WS] 消息处理错误:', err);
            ws.send(JSON.stringify({
                type: 'error',
                message: '服务器内部错误'
            }));
        }
    });

    ws.on('close', () => {
        console.log('[WS] 客户端断开');
        if (sshManager) {
            sshManager.disconnect();
        }
        if (sessionId) {
            sessions.delete(sessionId);
        }
    });

    ws.on('error', (err) => {
        console.error('[WS] WebSocket 错误:', err);
    });
});

// 启动服务器
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║        SSH-MANAGE SERVER STARTED          ║
╠═══════════════════════════════════════════╣
║  WebSocket: ws://localhost:${PORT}/ws        ║
║  Status: READY                            ║
╚═══════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n[Server] 正在关闭...');

    // 关闭所有 SSH 会话
    for (const [id, session] of sessions) {
        session.sshManager.disconnect();
    }

    wss.close(() => {
        server.close(() => {
            console.log('[Server] 已关闭');
            process.exit(0);
        });
    });
});
