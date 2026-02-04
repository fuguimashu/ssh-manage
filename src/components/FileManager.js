/**
 * 文件管理器组件
 * SFTP 文件浏览和操作界面
 */
export class FileManager {
    constructor(options = {}) {
        this.container = options.container;
        this.sessionId = options.sessionId;
        this.onError = options.onError || console.error;

        this.currentPath = '/';
        this.files = [];
        this.selectedFiles = new Set();
        this.isLoading = false;
        this.sortBy = 'name';  // name | size | mtime
        this.sortOrder = 'asc';  // asc | desc

        // 每个会话的当前路径
        this.sessionPaths = new Map();

        this._init();
    }

    /**
     * 初始化文件管理器
     */
    _init() {
        this._render();
        this._bindEvents();
    }

    /**
     * 渲染文件管理器界面
     */
    _render() {
        this.container.innerHTML = `
            <div class="file-manager">
                <!-- 工具栏 -->
                <div class="fm-toolbar">
                    <div class="fm-path-bar">
                        <button class="fm-btn fm-btn-icon" id="fmGoUp" title="上级目录">
                            <span>⬆</span>
                        </button>
                        <button class="fm-btn fm-btn-icon" id="fmGoHome" title="主目录">
                            <span>🏠</span>
                        </button>
                        <input type="text" class="fm-path-input" id="fmPathInput" value="/" />
                        <button class="fm-btn fm-btn-icon" id="fmRefresh" title="刷新">
                            <span>🔄</span>
                        </button>
                    </div>
                </div>
                
                <!-- 批量操作栏 (隐藏状态) -->
                <div class="fm-batch-bar hidden" id="fmBatchBar">
                    <span class="fm-batch-info">
                        <span id="fmSelectedCount">0</span> 个文件已选择
                    </span>
                    <div class="fm-batch-actions">
                        <button class="fm-btn fm-btn-primary" id="fmBatchDownload">
                            <span>📥</span> 下载
                        </button>
                        <button class="fm-btn fm-btn-danger" id="fmBatchDelete">
                            <span>🗑️</span> 删除
                        </button>
                        <button class="fm-btn" id="fmCancelSelect">
                            <span>✖</span> 取消
                        </button>
                    </div>
                </div>
                
                <!-- 文件列表头部 -->
                <div class="fm-list-header">
                    <div class="fm-col-check">
                        <input type="checkbox" id="fmSelectAll" title="全选" />
                    </div>
                    <div class="fm-col-name" data-sort="name">
                        名称 <span class="fm-sort-icon">▲</span>
                    </div>
                    <div class="fm-col-size" data-sort="size">
                        大小
                    </div>
                    <div class="fm-col-mtime" data-sort="mtime">
                        修改时间
                    </div>
                    <div class="fm-col-perm">
                        权限
                    </div>
                </div>
                
                <!-- 文件列表 -->
                <div class="fm-list" id="fmFileList">
                    <div class="fm-loading">
                        <span class="fm-spinner"></span>
                        <span>加载中...</span>
                    </div>
                </div>
                
                <!-- 底部操作栏 -->
                <div class="fm-footer">
                    <button class="fm-btn fm-btn-primary" id="fmUpload">
                        <span>📤</span> 上传文件
                    </button>
                    <button class="fm-btn fm-btn-primary" id="fmUploadFolder">
                        <span>📂</span> 上传文件夹
                    </button>
                    <button class="fm-btn" id="fmNewFolder">
                        <span>📁</span> 新建文件夹
                    </button>
                    <div class="fm-status">
                        <span id="fmStatus">就绪</span>
                    </div>
                </div>
                
                <!-- 隐藏的文件输入 -->
                <input type="file" id="fmFileInput" multiple style="display: none;" />
                <input type="file" id="fmFolderInput" webkitdirectory directory multiple style="display: none;" />
            </div>
        `;

        // 缓存元素引用
        this.elements = {
            fileList: this.container.querySelector('#fmFileList'),
            pathInput: this.container.querySelector('#fmPathInput'),
            batchBar: this.container.querySelector('#fmBatchBar'),
            selectedCount: this.container.querySelector('#fmSelectedCount'),
            selectAll: this.container.querySelector('#fmSelectAll'),
            status: this.container.querySelector('#fmStatus'),
            fileInput: this.container.querySelector('#fmFileInput'),
            folderInput: this.container.querySelector('#fmFolderInput')
        };
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 上级目录
        this.container.querySelector('#fmGoUp').addEventListener('click', () => {
            this.goUp();
        });

        // 主目录
        this.container.querySelector('#fmGoHome').addEventListener('click', () => {
            this.goToPath('/home');
        });

        // 刷新
        this.container.querySelector('#fmRefresh').addEventListener('click', () => {
            this.refresh();
        });

        // 路径输入回车
        this.elements.pathInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.goToPath(this.elements.pathInput.value);
            }
        });

        // 全选
        this.elements.selectAll.addEventListener('change', (e) => {
            this._toggleSelectAll(e.target.checked);
        });

        // 批量下载
        this.container.querySelector('#fmBatchDownload').addEventListener('click', () => {
            this.downloadSelected();
        });

        // 批量删除
        this.container.querySelector('#fmBatchDelete').addEventListener('click', () => {
            this.deleteSelected();
        });

        // 取消选择
        this.container.querySelector('#fmCancelSelect').addEventListener('click', () => {
            this.clearSelection();
        });

        // 上传
        this.container.querySelector('#fmUpload').addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        // 文件选择
        this.elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.uploadFiles(Array.from(e.target.files));
                e.target.value = '';
            }
        });

        // 上传文件夹
        this.container.querySelector('#fmUploadFolder').addEventListener('click', () => {
            this.elements.folderInput.click();
        });

        // 文件夹选择
        this.elements.folderInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.uploadFolder(Array.from(e.target.files));
                e.target.value = '';
            }
        });

        // 新建文件夹
        this.container.querySelector('#fmNewFolder').addEventListener('click', () => {
            this.createFolder();
        });

        // 排序
        this.container.querySelectorAll('[data-sort]').forEach(el => {
            el.addEventListener('click', () => {
                const sortBy = el.dataset.sort;
                if (this.sortBy === sortBy) {
                    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortBy = sortBy;
                    this.sortOrder = 'asc';
                }
                this._renderFileList();
            });
        });

        // 右键菜单
        this.elements.fileList.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const fileItem = e.target.closest('.fm-file-item');
            if (fileItem) {
                const index = parseInt(fileItem.dataset.index, 10);
                this._showContextMenu(e.clientX, e.clientY, this.files[index]);
            }
        });
    }

    /**
     * 设置会话 ID
     * @param {string} sessionId - 新的会话 ID
     */
    setSessionId(sessionId) {
        // 保存当前会话的路径
        if (this.sessionId && this.currentPath) {
            this.sessionPaths.set(this.sessionId, this.currentPath);
        }

        this.sessionId = sessionId;

        // 恢复新会话的路径，如果没有则使用根目录
        this.currentPath = this.sessionPaths.get(sessionId) || '/';
        this.files = [];
        this.clearSelection();
    }

    /**
     * 加载目录内容
     */
    async loadDirectory(path = this.currentPath) {
        console.log('[FileManager] loadDirectory 被调用, sessionId:', this.sessionId, 'path:', path);
        if (!this.sessionId) {
            this._setStatus('未连接');
            console.log('[FileManager] 没有 sessionId, 返回');
            return;
        }

        this.isLoading = true;
        this._showLoading();

        try {
            const url = `/api/sftp/${this.sessionId}/list?path=${encodeURIComponent(path)}`;
            console.log('[FileManager] API 调用:', url);
            const response = await fetch(url);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            this.currentPath = data.path;
            this.files = data.files;
            this.elements.pathInput.value = this.currentPath;

            this._renderFileList();
            this._setStatus(`${this.files.length} 个项目`);
        } catch (err) {
            console.error('[FileManager] 加载目录失败:', err);
            this._setStatus(`错误: ${err.message}`);
            this.onError(err);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 渲染文件列表
     */
    _renderFileList() {
        // 排序文件
        const sortedFiles = [...this.files].sort((a, b) => {
            let aVal, bVal;

            // 目录始终在前
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;

            switch (this.sortBy) {
                case 'size':
                    aVal = a.size;
                    bVal = b.size;
                    break;
                case 'mtime':
                    aVal = new Date(a.mtime).getTime();
                    bVal = new Date(b.mtime).getTime();
                    break;
                default:
                    aVal = a.name.toLowerCase();
                    bVal = b.name.toLowerCase();
                    return this.sortOrder === 'asc'
                        ? aVal.localeCompare(bVal)
                        : bVal.localeCompare(aVal);
            }

            return this.sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        });

        if (sortedFiles.length === 0) {
            this.elements.fileList.innerHTML = `
                <div class="fm-empty">
                    <span class="fm-empty-icon">📂</span>
                    <span>空目录</span>
                </div>
            `;
            return;
        }

        const html = sortedFiles.map((file, index) => {
            const icon = this._getFileIcon(file);
            const size = file.type === 'directory' ? '-' : this._formatSize(file.size);
            const mtime = this._formatDate(file.mtime);
            const isSelected = this.selectedFiles.has(file.name);

            return `
                <div class="fm-file-item ${isSelected ? 'selected' : ''}" 
                     data-index="${index}" 
                     data-name="${file.name}"
                     data-type="${file.type}">
                    <div class="fm-col-check">
                        <input type="checkbox" class="fm-file-check" 
                               ${isSelected ? 'checked' : ''} />
                    </div>
                    <div class="fm-col-name">
                        <span class="fm-file-icon">${icon}</span>
                        <span class="fm-file-name">${file.name}</span>
                    </div>
                    <div class="fm-col-size">${size}</div>
                    <div class="fm-col-mtime">${mtime}</div>
                    <div class="fm-col-perm">${file.permissions}</div>
                </div>
            `;
        }).join('');

        this.elements.fileList.innerHTML = html;

        // 绑定文件项事件
        this.elements.fileList.querySelectorAll('.fm-file-item').forEach(item => {
            // 双击进入目录或下载文件
            item.addEventListener('dblclick', () => {
                const index = parseInt(item.dataset.index, 10);
                const file = sortedFiles[index];
                if (file.type === 'directory') {
                    this.goToPath(this._joinPath(this.currentPath, file.name));
                } else {
                    this.downloadFile(file);
                }
            });

            // 复选框点击
            item.querySelector('.fm-file-check').addEventListener('change', (e) => {
                e.stopPropagation();
                const name = item.dataset.name;
                if (e.target.checked) {
                    this.selectedFiles.add(name);
                    item.classList.add('selected');
                } else {
                    this.selectedFiles.delete(name);
                    item.classList.remove('selected');
                }
                this._updateBatchBar();
            });
        });
    }

    /**
     * 上级目录
     */
    goUp() {
        if (this.currentPath === '/') return;
        const parent = this.currentPath.split('/').slice(0, -1).join('/') || '/';
        this.goToPath(parent);
    }

    /**
     * 跳转路径
     */
    goToPath(path) {
        this.clearSelection();
        this.loadDirectory(path);
    }

    /**
     * 刷新
     */
    refresh() {
        this.loadDirectory(this.currentPath);
    }

    /**
     * 下载单个文件
     */
    downloadFile(file) {
        if (file.type === 'directory') {
            this.onError(new Error('不能下载目录'));
            return;
        }

        const path = this._joinPath(this.currentPath, file.name);
        const url = `/api/sftp/${this.sessionId}/download?path=${encodeURIComponent(path)}`;

        // 创建隐藏链接触发下载
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        this._setStatus(`正在下载: ${file.name}`);
    }

    /**
     * 下载选中的文件
     */
    downloadSelected() {
        const selected = this._getSelectedFiles();
        if (selected.length === 0) return;

        if (selected.length === 1) {
            this.downloadFile(selected[0]);
        } else {
            // TODO: 批量下载（ZIP）
            this._setStatus('批量下载功能开发中...');
        }
    }

    /**
     * 删除选中的文件
     */
    async deleteSelected() {
        const selected = this._getSelectedFiles();
        if (selected.length === 0) return;

        const confirm = window.confirm(`确定要删除 ${selected.length} 个项目吗？`);
        if (!confirm) return;

        try {
            const paths = selected.map(f => this._joinPath(this.currentPath, f.name));

            const response = await fetch(`/api/sftp/${this.sessionId}/delete-batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            const successCount = data.results.filter(r => r.success).length;
            this._setStatus(`已删除 ${successCount} 个项目`);

            this.clearSelection();
            this.refresh();
        } catch (err) {
            console.error('[FileManager] 删除失败:', err);
            this._setStatus(`删除失败: ${err.message}`);
            this.onError(err);
        }
    }

    /**
     * 上传文件
     */
    async uploadFiles(files) {
        if (!this.sessionId || files.length === 0) return;

        this._setStatus(`准备上传 ${files.length} 个文件...`);

        for (const file of files) {
            await this._uploadFile(file);
        }

        this.refresh();
    }

    /**
     * 上传文件夹
     * @param {File[]} files - 从 webkitdirectory 获取的文件列表
     */
    async uploadFolder(files) {
        if (!this.sessionId || files.length === 0) return;

        // 获取文件夹根目录名称
        const firstFile = files[0];
        const rootFolder = firstFile.webkitRelativePath.split('/')[0];

        this._setStatus(`准备上传文件夹: ${rootFolder} (${files.length} 个文件)...`);

        // 收集需要创建的目录
        const dirsToCreate = new Set();
        for (const file of files) {
            const relativePath = file.webkitRelativePath;
            const parts = relativePath.split('/');
            // 收集所有父目录
            for (let i = 1; i < parts.length; i++) {
                const dir = parts.slice(0, i).join('/');
                dirsToCreate.add(dir);
            }
        }

        // 按路径长度排序（确保父目录先创建）
        const sortedDirs = Array.from(dirsToCreate).sort((a, b) => a.split('/').length - b.split('/').length);

        // 创建目录结构
        let createdDirs = 0;
        for (const dir of sortedDirs) {
            const remotePath = this._joinPath(this.currentPath, dir);
            try {
                await fetch(`/api/sftp/${this.sessionId}/mkdir`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: remotePath })
                });
                createdDirs++;
                this._setStatus(`创建目录 (${createdDirs}/${sortedDirs.length}): ${dir}`);
            } catch (err) {
                // 目录可能已存在，忽略错误
                console.log(`[FileManager] 目录可能已存在: ${dir}`);
            }
        }

        // 上传所有文件
        let uploadedFiles = 0;
        for (const file of files) {
            const relativePath = file.webkitRelativePath;
            // 获取文件的目录路径（不含文件名）
            const dirPath = relativePath.split('/').slice(0, -1).join('/');
            const targetPath = this._joinPath(this.currentPath, dirPath);

            await this._uploadFile(file, targetPath);
            uploadedFiles++;
            this._setStatus(`上传文件 (${uploadedFiles}/${files.length}): ${file.name}`);
        }

        this._setStatus(`上传完成: ${rootFolder} (${files.length} 个文件)`);
        this.refresh();
    }

    /**
     * 上传单个文件（分片）
     * @param {File} file - 要上传的文件
     * @param {string} [targetPath] - 可选的目标路径，默认使用当前路径
     */
    async _uploadFile(file, targetPath = null) {
        const CHUNK_SIZE = 5 * 1024 * 1024;  // 5MB
        const remotePath = targetPath || this.currentPath;

        try {
            // 1. 初始化上传
            const initResponse = await fetch(`/api/sftp/${this.sessionId}/upload/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: file.name,
                    fileSize: file.size,
                    remotePath: remotePath
                })
            });

            const initData = await initResponse.json();
            if (!initData.success) {
                throw new Error(initData.error);
            }

            const { uploadId, totalChunks } = initData;

            // 2. 分片上传
            for (let i = 0; i < totalChunks; i++) {
                const start = i * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                const chunkResponse = await fetch(`/api/sftp/${this.sessionId}/upload/chunk`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'X-Upload-Id': uploadId,
                        'X-Chunk-Index': i.toString()
                    },
                    body: chunk
                });

                const chunkData = await chunkResponse.json();
                if (!chunkData.success) {
                    throw new Error(chunkData.error);
                }

                const progress = Math.round((i + 1) / totalChunks * 100);
                this._setStatus(`上传 ${file.name}: ${progress}%`);
            }

            // 3. 完成上传
            const completeResponse = await fetch(`/api/sftp/${this.sessionId}/upload/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId })
            });

            const completeData = await completeResponse.json();
            if (!completeData.success) {
                throw new Error(completeData.error);
            }

            this._setStatus(`上传完成: ${file.name}`);
        } catch (err) {
            console.error('[FileManager] 上传失败:', err);
            this._setStatus(`上传失败: ${err.message}`);
            this.onError(err);
        }
    }

    /**
     * 创建文件夹
     */
    async createFolder() {
        const name = window.prompt('输入文件夹名称:');
        if (!name) return;

        try {
            const path = this._joinPath(this.currentPath, name);

            const response = await fetch(`/api/sftp/${this.sessionId}/mkdir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            this._setStatus(`已创建: ${name}`);
            this.refresh();
        } catch (err) {
            console.error('[FileManager] 创建文件夹失败:', err);
            this._setStatus(`创建失败: ${err.message}`);
            this.onError(err);
        }
    }

    /**
     * 清除选择
     */
    clearSelection() {
        this.selectedFiles.clear();
        this.elements.selectAll.checked = false;
        this.elements.fileList.querySelectorAll('.fm-file-item').forEach(item => {
            item.classList.remove('selected');
            item.querySelector('.fm-file-check').checked = false;
        });
        this._updateBatchBar();
    }

    /**
     * 全选/取消全选
     */
    _toggleSelectAll(checked) {
        this.elements.fileList.querySelectorAll('.fm-file-item').forEach(item => {
            const name = item.dataset.name;
            const checkbox = item.querySelector('.fm-file-check');

            if (checked) {
                this.selectedFiles.add(name);
                item.classList.add('selected');
            } else {
                this.selectedFiles.delete(name);
                item.classList.remove('selected');
            }
            checkbox.checked = checked;
        });
        this._updateBatchBar();
    }

    /**
     * 更新批量操作栏
     */
    _updateBatchBar() {
        const count = this.selectedFiles.size;
        this.elements.selectedCount.textContent = count;

        if (count > 0) {
            this.elements.batchBar.classList.remove('hidden');
        } else {
            this.elements.batchBar.classList.add('hidden');
        }
    }

    /**
     * 获取选中的文件对象
     */
    _getSelectedFiles() {
        return this.files.filter(f => this.selectedFiles.has(f.name));
    }

    /**
     * 显示右键菜单
     */
    _showContextMenu(x, y, file) {
        // 移除现有菜单
        document.querySelectorAll('.fm-context-menu').forEach(m => m.remove());

        const menu = document.createElement('div');
        menu.className = 'fm-context-menu';
        menu.innerHTML = `
            <div class="fm-menu-item" data-action="download">📥 下载</div>
            <div class="fm-menu-item" data-action="rename">✏️ 重命名</div>
            <div class="fm-menu-item" data-action="delete">🗑️ 删除</div>
            <div class="fm-menu-divider"></div>
            <div class="fm-menu-item" data-action="copypath">📋 复制路径</div>
        `;

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        document.body.appendChild(menu);

        // 绑定菜单事件
        menu.querySelectorAll('.fm-menu-item').forEach(item => {
            item.addEventListener('click', async () => {
                const action = item.dataset.action;
                menu.remove();

                switch (action) {
                    case 'download':
                        this.downloadFile(file);
                        break;
                    case 'rename':
                        await this._renameFile(file);
                        break;
                    case 'delete':
                        await this._deleteFile(file);
                        break;
                    case 'copypath':
                        const path = this._joinPath(this.currentPath, file.name);
                        navigator.clipboard.writeText(path);
                        this._setStatus('路径已复制');
                        break;
                }
            });
        });

        // 点击其他地方关闭菜单
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    /**
     * 重命名文件
     */
    async _renameFile(file) {
        const newName = window.prompt('输入新名称:', file.name);
        if (!newName || newName === file.name) return;

        try {
            const oldPath = this._joinPath(this.currentPath, file.name);
            const newPath = this._joinPath(this.currentPath, newName);

            const response = await fetch(`/api/sftp/${this.sessionId}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath, newPath })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            this._setStatus(`已重命名: ${file.name} → ${newName}`);
            this.refresh();
        } catch (err) {
            console.error('[FileManager] 重命名失败:', err);
            this._setStatus(`重命名失败: ${err.message}`);
            this.onError(err);
        }
    }

    /**
     * 删除单个文件
     */
    async _deleteFile(file) {
        const confirm = window.confirm(`确定要删除 ${file.name} 吗？`);
        if (!confirm) return;

        try {
            const path = this._joinPath(this.currentPath, file.name);
            const endpoint = file.type === 'directory' ? 'rmdir' : 'unlink';

            const response = await fetch(
                `/api/sftp/${this.sessionId}/${endpoint}?path=${encodeURIComponent(path)}`,
                { method: 'DELETE' }
            );

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error);
            }

            this._setStatus(`已删除: ${file.name}`);
            this.refresh();
        } catch (err) {
            console.error('[FileManager] 删除失败:', err);
            this._setStatus(`删除失败: ${err.message}`);
            this.onError(err);
        }
    }

    /**
     * 显示加载状态
     */
    _showLoading() {
        this.elements.fileList.innerHTML = `
            <div class="fm-loading">
                <span class="fm-spinner"></span>
                <span>加载中...</span>
            </div>
        `;
    }

    /**
     * 设置状态文字
     */
    _setStatus(text) {
        this.elements.status.textContent = text;
    }

    /**
     * 获取文件图标
     */
    _getFileIcon(file) {
        if (file.type === 'directory') return '📁';
        if (file.type === 'symlink') return '🔗';

        const ext = file.name.split('.').pop().toLowerCase();
        const icons = {
            'txt': '📄', 'md': '📄', 'log': '📄',
            'js': '📜', 'ts': '📜', 'py': '🐍', 'java': '☕',
            'html': '🌐', 'css': '🎨', 'json': '📋', 'xml': '📋',
            'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
            'mp3': '🎵', 'wav': '🎵', 'mp4': '🎬', 'avi': '🎬',
            'zip': '📦', 'tar': '📦', 'gz': '📦', 'rar': '📦',
            'pdf': '📕', 'doc': '📘', 'docx': '📘', 'xls': '📗', 'xlsx': '📗',
            'sh': '⚙️', 'bash': '⚙️', 'conf': '⚙️', 'cfg': '⚙️'
        };

        return icons[ext] || '📄';
    }

    /**
     * 格式化文件大小
     */
    _formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    /**
     * 格式化日期
     */
    _formatDate(date) {
        const d = new Date(date);
        return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * 路径拼接
     */
    _joinPath(base, name) {
        if (base === '/') return '/' + name;
        return base + '/' + name;
    }
}
