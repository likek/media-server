    const mediaContainer = document.getElementById('mediaContainer');
    const topContainer = document.getElementById('top');
    const currentPathElem = document.getElementById('currentPath');
    const backButton = document.getElementById('btnBackDir');
    const progressBar = document.getElementById('progressBar');
    const progressBarValue = document.getElementById('progressBarValue');
    const btnRoot = document.getElementById('btnRoot');
    const fileInput = document.getElementById('fileInput');

    let currentPath = '';
    const baseServer = 'http://192.168.31.103:3000/';
    const fileCache = {};
    let totalFiles = [];
    let renderedFilesCount = 0;
    const pageSize = getRowCount();

    hideProgressBar();

    function goBackDir() {
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
        loadMedia(parentPath);
    }

    function getRowCount() {
        const totalWidth = mediaContainer.clientWidth
        const itemWidth = 350 // 每项宽度
        return Math.floor(totalWidth / itemWidth) || 10
    }

    function hideProgressBar() {
        progressBar.style.display = 'none';
        progressBarValue.style.display = 'none';
    }

    function showProgressBar() {
        progressBar.style.display = '';
        progressBarValue.style.display = '';
    }

    async function updateCache() {
        try {
            const response = await fetch(`${baseServer}updateCache`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: currentPath })
            });
            loadMedia(currentPath)
        } catch (error) {
            console.error('Error updating cache:', error);
            alert('Failed to update cache.');
        }
    }

    async function loadMedia(path = '') {
        currentPath = path;
        renderedFilesCount = 0;
        totalFiles = [];
        currentPathElem.innerHTML = `${currentPath || '/'}`;
        currentPathElem.onclick = () => {
            copyText(currentPathElem.innerText)
        }
        btnRoot.style.display = currentPath === '' ? 'none' : '';
        backButton.style.display = currentPath === '' ? 'none' : '';

        // Check cache
        if (fileCache[currentPath]) {
            totalFiles = fileCache[currentPath];
            renderFiles(totalFiles.slice(0, pageSize)); // Render the first page
            checkAndRenderInitialFiles();
        } else {
            try {
                const response = await fetch(`${baseServer}files?path=${encodeURIComponent(path)}`);
                const files = await response.json();
                totalFiles = files; // Cache the result
                fileCache[currentPath] = files;
                renderFiles(totalFiles.slice(0, pageSize)); // Render the first page
                checkAndRenderInitialFiles();
            } catch (error) {
                console.error('Error loading media:', error);
                alert('Failed to load media.');
            }
        }
    }

    function checkAndRenderInitialFiles() {
        while (mediaContainer.scrollHeight <= window.innerHeight - topContainer.offsetHeight && renderedFilesCount < totalFiles.length) {
            renderMoreFiles();
        }
    }

    function renderFiles(files) {
        const fragment = document.createDocumentFragment();
        files.forEach(file => {
            const fileExt = file.filename.split('.').pop().toLowerCase();
            const div = document.createElement('div');
            div.classList.add('media-item');
    
            const fileNameElement = document.createElement('p');
            const textSpan = document.createElement('span');
            textSpan.textContent = file.filename.substring(file.filename.lastIndexOf('/') + 1);
            if (file.format) {
                textSpan.textContent += ` (${file.format})`;
            }
            textSpan.style = 'display: inline-block;vertical-align:middle;';
            fileNameElement.appendChild(textSpan);

            const iconEdit = document.createElement('img');
            iconEdit.src = 'assets/icon_edit.png';
            iconEdit.style.width = '12px';
            iconEdit.style.height = '12px';
            iconEdit.style.margin = '0 0 0 4px';
            fileNameElement.appendChild(iconEdit);
            fileNameElement.addEventListener('click', (e) => {
                if(e.target.tagName.toLowerCase() === 'p') {
                    return
                }
                e.stopPropagation();
                if (file.type === 'folder') {
                    renameFile(file.filename, currentPath, file.type);
                } else {
                    renameFile(file.filename.substring(file.filename.lastIndexOf('/') + 1), currentPath, file.type);
                }
            });
            div.appendChild(fileNameElement);
    
            if (file.type === 'folder') {
                const folderIcon = document.createElement('img');
                folderIcon.src = 'assets/icon_folder.png';
                folderIcon.style.width = '20px';
                folderIcon.style.height = '20px';
                folderIcon.style.margin = '0 4px 0 0';
                fileNameElement.insertBefore(folderIcon, textSpan);
                div.addEventListener('click', () => loadMedia(file.path));
            } else if (['mp4', 'webm', 'ogg', 'ts'].includes(fileExt)) {
                const video = document.createElement('video');
                if (file.thumbnail) {
                    video.poster = baseServer + file.thumbnail;
                }
                video.controls = true;
                if(['ts'].includes(fileExt)) {
                    // const source = document.createElement('source');

                    // source.src = baseServer + file.filename;
                    // source.type = 'video/mp2t';
        
                    // video.appendChild(source);
                    video.addEventListener('click', async (e) => {
                        if (!videoHelper.isLoading(video) && !videoHelper.isReady(video)) {
                            e.preventDefault()
                            e.stopPropagation()
                            if (!video.__mOverlay) {
                                const container = video.parentElement;
                                const loadingOverlay = document.createElement('div');
                                loadingOverlay.classList.add('loading-overlay');
                                loadingOverlay.innerText = '加载中...';
                                video.__mOverlay = loadingOverlay;
                                container.appendChild(loadingOverlay);
                            }
                            video.__mOverlay.style.display = 'flex';
                            await videoHelper.loadTs(video, baseServer + file.filename, (error) => {
                                showToast(`视频加载失败`, 'error')
                            })
                            video.__mOverlay.style.display = 'none';
                            videoHelper.play(video)
                        }
                    })
                } else {
                    video.src = baseServer + file.filename;
                }
                div.appendChild(video);
            } else if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExt)) {
                const img = document.createElement('img');
                img.src = baseServer + file.filename;
                div.appendChild(img);
            }
    
            const fileInfoElement = document.createElement('p');
            if (file.type !== 'folder') {
                fileInfoElement.textContent = `修改日期: ${new Date(file.lastModified).toLocaleString()}`;
                const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
                fileInfoElement.textContent += ` 大小: ${sizeInMB} MB`;
            }
            fileInfoElement.style = 'font-size: 10px; color: #666;margin: 0 0 4px 0';
            div.appendChild(fileInfoElement);
    
            const footer = document.createElement('div');
            footer.style = `display: flex;justify-content: ${'space-between'};`;
            const deleteButton = document.createElement('button');
            deleteButton.style.marginRight = 'auto';
            deleteButton.innerText = '删除';
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (file.type === 'folder') {
                    deleteFile(file.filename, currentPath, file.type);
                } else {
                    deleteFile(file.filename.substring(file.filename.lastIndexOf('/') + 1), currentPath, file.type);
                }
            });
            footer.appendChild(deleteButton);

            const moveButton = document.createElement('button');
            moveButton.innerText = '移动';
            moveButton.className = 'move-button';
        
            moveButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetFolder = prompt('请输入目标文件夹').trim();
                if (targetFolder === '') {
                    showToast('目标文件及不能为空', 'warn');
                } else if (targetFolder === currentPath) {
                    showToast('不能移动到相同目录', 'warn');
                } else {
                    if (file.type === 'folder') {
                        moveFileOrFolder(file.filename, targetFolder, currentPath);
                    } else {
                        moveFileOrFolder(file.filename.substring(file.filename.lastIndexOf('/') + 1), targetFolder, currentPath);
                    }
                }
            });

            footer.appendChild(moveButton)

            if (file.type !== 'folder') {
                const a = document.createElement('a');
                a.innerHTML = '下载';
                a.href = baseServer + file.filename;
                a.download = file.filename.substring(file.filename.lastIndexOf('/') + 1);
                footer.appendChild(a);
            }
            div.appendChild(footer);
    
            fragment.appendChild(div);
        });
        if (renderedFilesCount === 0) {
            mediaContainer.innerHTML = ''; 
        }
        mediaContainer.appendChild(fragment);
        renderedFilesCount += files.length;
    }

    async function renameFile(filename, path, type) {
        const newFilename = prompt("请输入新的名称：", filename);
        if (!newFilename || newFilename === filename) {
            return; // 用户取消或未修改文件名
        }
    
        try {
            const response = await fetch(`${baseServer}rename`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ oldName: filename, newName: newFilename, path, type })
            });
            if(response.status === 200) {
                showToast('File renamed successfully.', 'success');
                delete fileCache[path]; // Invalidate cache
                loadMedia(path); // 重新加载媒体列表
            } else {
                const data = await response.json();
                alert(data.message)
            }
        } catch (error) {
            console.error('Error renaming file:', error);
            alert('Failed to rename file.');
        }
    }

    async function createFolder() {
        let folderName = prompt("请输入文件夹名称：", '新建文件夹');
        folderName = (folderName || '').trim()
        if (!folderName) {
            return
        }
    
        try {
            const response = await fetch(`${baseServer}createFolder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ folderName, path: currentPath })
            });
            if(response.status === 200) {
                showToast('Folder created successfully.','success');
                delete fileCache[currentPath]; // Invalidate cache
                loadMedia(currentPath); // 重新加载媒体列表
            } else {
                const data = await response.json();
                alert(data.message)
            }
        } catch (error) {
            console.error('Error creating folder:', error);
            alert('Failed to create folder.');
        }
    }

    function renderMoreFiles() {
        const nextFiles = totalFiles.slice(renderedFilesCount, renderedFilesCount + pageSize);
        if (nextFiles.length) {
            console.log(`render: ${renderedFilesCount}, ${renderedFilesCount + pageSize}`)
            renderFiles(nextFiles);
        }
    }

    mediaContainer.addEventListener('scroll', () => {
        if (mediaContainer.clientHeight + mediaContainer.scrollTop >= mediaContainer.scrollHeight - 50) {
            renderMoreFiles();
        }
    });

    async function deleteFile(filename, path, type) {
        const userConfirmed = confirm(`确定要删除文件 ${filename} 吗？`);
        if (userConfirmed) {
            try {
                const response = await fetch(`${baseServer}delete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ filename, path, type })
                });
                showToast('File deleted successfully.','success');
                delete fileCache[currentPath]; // Invalidate cache
                loadMedia(currentPath); // 重新加载媒体列表
            } catch (error) {
                console.error('Error deleting file:', error);
            }
        }
    }

    async function uploadFile() {
        const file = fileInput.files[0];

        if (!file) {
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        // 创建 XMLHttpRequest 对象
        const xhr = new XMLHttpRequest();

        // 监听上传进度事件
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                // 更新进度条显示
                updateProgressBar(event.loaded, event.total);
            }
        });

        // 监听上传完成事件
        xhr.addEventListener('load', async () => {
            if (xhr.status === 200) {
                showToast('File uploaded successfully.','success');
                delete fileCache[currentPath]; // Invalidate cache
                loadMedia(currentPath);
                fileInput.value = '';
                hideProgressBar();
            } else {
                console.error('Error uploading file:', xhr.statusText);
                hideProgressBar();
                alert('File uploaded failed.');
            }
        });

        // 监听上传失败事件
        xhr.addEventListener('error', () => {
            console.error('Upload failed');
            alert('File uploaded failed.');
        });

        // 设置请求地址和方法
        const url = `${baseServer}upload?path=${encodeURIComponent(currentPath)}`;
        xhr.open('POST', url);

        try {
            // 发送上传请求
            xhr.send(formData);
        } catch (error) {
            console.error('Error sending request:', error);
        }
    }
    function moveFileOrFolder(filename, targetFolder, currentPath) {
        const url = `${baseServer}move`;
        const body = JSON.stringify({
            filename,
            targetFolder,
            currentPath,
        });
    
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('File moved successfully', 'success');
                delete fileCache[currentPath];
                delete fileCache[targetFolder.replace(/^\/+/, '')];
                loadMedia(currentPath);
            } else {
                showToast(data.message || 'Error moving file', 'error');
            }
        })
        .catch(error => {
            console.error('Error moving file:', error);
            showToast('Error moving file', 'error');
        });
    }

    function triggerFileUpload() {
        fileInput.click();
    }

    function updateProgressBar(loaded, total) {
        const percentComplete = (loaded / total) * 100;
        showProgressBar();
        progressBar.value = percentComplete;
        progressBarValue.innerHTML = `${(loaded / 1024 / 1024).toFixed(2)}MB/${(total / 1024 / 1024).toFixed(2)}MB`;
    }

    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.innerText = message;
    
        // 移除之前的类型类
        toast.className = 'toast';
        toast.classList.add('show', type);
    
        // 3秒后移除show类
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function copyText(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        let error;
        try {
            document.execCommand('copy');
            console.log('Text copied to clipboard:', text);
        } catch (err) {
            error = err;
            console.error('Failed to copy text to clipboard:', err);
        }
    
        document.body.removeChild(textarea);
        if (!error) {
            showToast('拷贝成功')
        }
    }
    

    document.addEventListener('DOMContentLoaded', () => {
        loadMedia();
    });

    window.onresize = () => {
        checkAndRenderInitialFiles()
    }