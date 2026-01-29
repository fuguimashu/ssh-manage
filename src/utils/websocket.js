/**
 * WebSocket 客户端封装
 */
export class WebSocketClient {
    constructor(options = {}) {
        this.url = options.url || this._getWebSocketUrl();
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 1000;

        this.handlers = {
            onOpen: options.onOpen || (() => { }),
            onClose: options.onClose || (() => { }),
            onError: options.onError || (() => { }),
            onMessage: options.onMessage || (() => { }),
            onConnected: options.onConnected || (() => { }),
            onDisconnected: options.onDisconnected || (() => { }),
            onData: options.onData || (() => { })
        };
    }

    /**
     * 获取 WebSocket URL
     */
    _getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        // 开发环境使用 3001 端口，生产环境使用当前端口
        const port = import.meta.env.DEV ? '3001' : window.location.port;
        return `${protocol}//${host}:${port}/ws`;
    }

    /**
     * 连接 WebSocket
     */
    connect() {
        return new Promise((resolve, reject) => {
            console.log(`[WS] 连接到 ${this.url}`);

            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('[WS] 连接已建立');
                this.reconnectAttempts = 0;
                this.handlers.onOpen();
                resolve();
            };

            this.ws.onclose = (event) => {
                console.log('[WS] 连接已关闭:', event.code);
                this.handlers.onClose(event);
            };

            this.ws.onerror = (error) => {
                console.error('[WS] 连接错误:', error);
                this.handlers.onError(error);
                reject(error);
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this._handleMessage(data);
                } catch (err) {
                    console.error('[WS] 消息解析错误:', err);
                }
            };
        });
    }

    /**
     * 处理接收到的消息
     */
    _handleMessage(data) {
        this.handlers.onMessage(data);

        switch (data.type) {
            case 'connected':
                this.handlers.onConnected(data);
                break;
            case 'disconnected':
                this.handlers.onDisconnected(data);
                break;
            case 'data':
                this.handlers.onData(data.data);
                break;
            case 'error':
                this.handlers.onError(new Error(data.message));
                break;
        }
    }

    /**
     * 发送 SSH 连接请求
     */
    sendConnect(config) {
        this.send({
            type: 'connect',
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password
        });
    }

    /**
     * 发送终端数据
     */
    sendData(data) {
        this.send({
            type: 'data',
            data
        });
    }

    /**
     * 发送终端大小调整
     */
    sendResize(cols, rows) {
        this.send({
            type: 'resize',
            cols,
            rows
        });
    }

    /**
     * 发送断开连接请求
     */
    sendDisconnect() {
        this.send({
            type: 'disconnect'
        });
    }

    /**
     * 发送消息
     */
    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.ws) {
            this.sendDisconnect();
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * 检查是否已连接
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}
