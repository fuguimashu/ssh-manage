/**
 * 连接配置表单组件
 */
export class ConnectForm {
    constructor(options = {}) {
        this.form = options.form;
        this.onSubmit = options.onSubmit || (() => { });

        this._init();
    }

    /**
     * 初始化表单
     */
    _init() {
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handleSubmit();
        });
    }

    /**
     * 处理表单提交
     */
    _handleSubmit() {
        const formData = new FormData(this.form);

        const config = {
            host: formData.get('host').trim(),
            port: parseInt(formData.get('port'), 10) || 22,
            username: formData.get('username').trim(),
            password: formData.get('password'),
            saveConnection: formData.get('saveConnection') === 'on'
        };

        // 验证
        if (!config.host) {
            this._showError('请输入主机地址');
            return;
        }

        if (!config.username) {
            this._showError('请输入用户名');
            return;
        }

        // 触发提交回调
        this.onSubmit(config);

        // 清空密码字段
        this.form.querySelector('#password').value = '';
    }

    /**
     * 填充表单
     */
    fillForm(connection) {
        this.form.querySelector('#host').value = connection.host || '';
        this.form.querySelector('#port').value = connection.port || 22;
        this.form.querySelector('#username').value = connection.username || '';
        this.form.querySelector('#password').value = connection.password || '';

        // 聚焦密码字段（如果密码为空）
        if (!connection.password) {
            this.form.querySelector('#password').focus();
        }
    }

    /**
     * 清空表单
     */
    clearForm() {
        this.form.reset();
        this.form.querySelector('#port').value = 22;
    }

    /**
     * 显示错误消息
     */
    _showError(message) {
        // 简单的错误提示，可以后续改进为 toast
        alert(message);
    }
}
