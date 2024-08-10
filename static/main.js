    const mediaContainer = document.getElementById('mediaContainer');
    const topContainer = document.getElementById('top');
    const currentPathElem = document.getElementById('currentPath');
    const backButton = document.getElementById('btnBackDir');
    const progressBar = document.getElementById('progressBar');
    const progressBarValue = document.getElementById('progressBarValue');
    const btnRoot = document.getElementById('btnRoot');
    const fileInput = document.getElementById('fileInput');

    let currentPath = '';
    const baseServer = '';
    const fileCache = {};
    let totalFiles = [];
    let renderedFilesCount = 0;
    const pageSize = getRowCount();
    let latestCopiedText = '';
    
    function getCache(path) {
        return fileCache['uploads/' + path]
    }

    function setCache(path, value) {
        fileCache['uploads/' + path] = value
    }

    function deleteCache(path) {
        delete fileCache['uploads/' + path]
    }

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

    async function handleSearch(event) {
        if(event) {
            event.preventDefault()
        }
        const inputSearch = document.getElementById('inputSearch')
        const query = inputSearch.value
        if (!query.trim()) {
            showToast('请输入搜索内容', 'warn')
            return
        }
        const searchTips = document.getElementById('searchTips')
        searchTips.style.opacity = '1';
        searchTips.style.display = 'block';
        setTimeout(() => {
            searchTips.style.opacity = '0';
            searchTips.style.display = 'none';
        }, 2000)
        try {
            renderedFilesCount = 0;
            totalFiles = [];
            const response = await fetch(`${baseServer}/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query, path: currentPath })
            });
            if (response.status === 200) {
                const files = await response.json();
                totalFiles = files;
                renderFiles(totalFiles.slice(0, pageSize)); // Render the first page
                checkAndRenderInitialFiles();
                btnRoot.style.display = '';
                backButton.style.display = currentPath === '' ? 'none' : '';
            } else {
                const data = await response.json();
                showToast(data.message, 'warn')
            }
        } catch (error) {
            console.error('Error loading media:', error);
            alert('Failed to load media.');
        }
    }

    async function updateCache() {
        try {
            const response = await fetch(`${baseServer}/updateCache`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: currentPath })
            });
            if (response.status === 200) {
                deleteCache(currentPath)
                loadMedia(currentPath)
                showToast('刷新数据成功', 'success')
            } else {
                const data = await response.json();
                showToast(data.message, 'warn')
            }
        } catch (error) {
            console.error('Error updating cache:', error);
            alert('Failed to update cache.');
        }
    }

    async function loadMedia(path = '', password) {
        renderedFilesCount = 0;
        totalFiles = [];

        const cacheValue = getCache(path)
        if (cacheValue) {
            totalFiles = cacheValue;
            renderFiles(totalFiles.slice(0, pageSize)); // Render the first page
            checkAndRenderInitialFiles();
            updateCurrentPath(path)
        } else {
            try {
                const response = await fetch(`${baseServer}/files`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ path, pw: password })
                });
                const data = await response.json();
                if (response.status === 200) {
                    totalFiles = data; // Cache the result
                    setCache(path, data)
                    renderFiles(totalFiles.slice(0, pageSize)); // Render the first page
                    checkAndRenderInitialFiles();
                    updateCurrentPath(path)
                } else if (response.status === 403 && data.lock) {
                    showToast(data.message, 'warn')

                    const pw = prompt('请输入文件夹密码');
                    if (!pw) {
                        showToast('密码不能为空', 'warn')
                    } else {
                        loadMedia(path, pw)
                    }
                } else {
                    showToast(data.message, 'warn')
                }
            } catch (error) {
                console.error('Error loading media:', error);
                alert('Failed to load media.');
            }
        }
    }

    function updateCurrentPath(path) {
        currentPath = path;
        currentPathElem.innerHTML = `${currentPath || '/'}`;
        currentPathElem.onclick = () => {
            copyText(currentPathElem)
        }
        btnRoot.style.display = currentPath === '' ? 'none' : '';
        backButton.style.display = currentPath === '' ? 'none' : '';

        const paths = path.split('/')
        const title = `${paths[paths.length - 2] ? paths[paths.length - 2] + '/' : ''}${paths[paths.length - 1]}` || '/'
        document.title = title
    }

    function checkAndRenderInitialFiles() {
        while (mediaContainer.scrollHeight <= window.innerHeight - topContainer.offsetHeight && renderedFilesCount < totalFiles.length) {
            renderMoreFiles();
        }
    }

    function encodeUrl(url) {
        return url.split('/').map(encodeURIComponent).join('/');
    }

    function renderFiles(files) {
        const fragment = document.createDocumentFragment();
        files.forEach(file => {
            const fileExt = file.filename.split('.').pop().toLowerCase();
            const div = document.createElement('div');
            div.classList.add('media-item');
            if(file.type === 'folder') {
                div.classList.add('media-item-folder');
            }
    
            const fileNameElement = document.createElement('p');
            const textSpan = document.createElement('span');
            textSpan.classList.add('touchable');
            const filename = file.filename.substring(file.filename.lastIndexOf('/') + 1)
            textSpan.textContent = filename;
            if (file.format) {
                textSpan.textContent += ` (${file.format})`;
            }
            textSpan.style = 'display: inline-block;vertical-align:middle;';
            fileNameElement.appendChild(textSpan);

            const iconEdit = document.createElement('img');
            iconEdit.classList.add('touchable');
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
                    renameFile(file.filename, file.folder || currentPath, file.type);
                } else {
                    renameFile(filename, file.folder || currentPath, file.type);
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
                div.addEventListener('click', (e) => {
                    e.stopPropagation()
                    loadMedia(file.path)
                });
            } else if (['mp4', 'webm', 'ogg', 'ts'].includes(fileExt)) {
                const video = document.createElement('video');
                if (file.thumbnail) {
                    video.poster = baseServer + file.thumbnail;
                }
                video.controls = true;
                video.playsInline = true
                video.preload = 'metadata';
                if(['ts'].includes(fileExt)) {
                    // const source = document.createElement('source');

                    // source.src = baseServer + file.filename;
                    // source.type = 'video/mp2t';
        
                    // video.appendChild(source);
                    video.addEventListener('click', async (e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (!videoHelper.isLoading(video) && !videoHelper.isReady(video)) {
                            showOverlay(div)
                            await videoHelper.loadTs(video, baseServer + file.filename, (error) => {
                                showToast(`视频加载失败`, 'error')
                            })
                            hideOverlay(div);
                            videoHelper.play(video);
                        }
                    })
                } else {
                    video.src = baseServer + file.filename;
                }
                div.appendChild(video);
            } else if (['jpg', 'jpeg', 'png', 'gif'].includes(fileExt)) {
                const img = document.createElement('img');
                img.src = encodeUrl(baseServer + file.filename)
                img.className = 'image';
                img.onclick = () => openImgModal(img);
                div.appendChild(img);
            } else if ('pdf' === fileExt) {
                const a = document.createElement('a');
                a.href = encodeUrl(baseServer + file.filename);
                a.innerText = filename
                a.target = '_blank'
                div.appendChild(a);
            }
    
            if (file.type !== 'folder') {
                const fileInfoElement = document.createElement('p');
                fileInfoElement.textContent = `修改日期: ${new Date(file.lastModified).toLocaleString()}`;
                const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
                fileInfoElement.textContent += ` 大小: ${sizeInMB} MB`;
                fileInfoElement.style = 'font-size: 10px; color: #666;margin: 0 0 4px 0';
                div.appendChild(fileInfoElement);
            }
    
            const footer = document.createElement('div');
            footer.style = `display: flex;justify-content: ${'space-between'};`;
            footer.classList.add('item-footer')
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-button';
            deleteButton.style.marginRight = 'auto';
            deleteButton.innerText = '删除';
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                if (file.type === 'folder') {
                    deleteFile(file.filename, file.folder || currentPath, file.type);
                } else {
                    deleteFile(filename, file.folder || currentPath, file.type);
                }
            });
            footer.appendChild(deleteButton);

            if(file.type !== 'folder' && ['ts'].includes(fileExt)) { 
                const convertButton = document.createElement('button');
                convertButton.innerText = '转mp4';
                convertButton.className = 'warn-button';
                convertButton.addEventListener('click', () => {
                    e.stopPropagation()
                    const originPath = `${(file.folder || currentPath)}/${filename}`
                    const targetPath = originPath.replace(/\.[^/.]+$/, '_ts.mp4')
                    showOverlay(div, '格式转换中...')
                    convertFile(originPath, targetPath).finally(() => {
                        hideOverlay(div)
                    })
                })
                footer.appendChild(convertButton)
            }

            if (file.type !== 'folder' && (fileExt === 'zip' || fileExt === 'rar')) {
                const unzipButton = document.createElement('button');
                unzipButton.innerText = '解压';
                unzipButton.className = 'warn-button'
                unzipButton.addEventListener('click', (e) => {
                    e.stopPropagation()
                    showOverlay(div, '解压中...')
                    unzipFile(`${file.folder || currentPath}/${filename}`).finally(() => {
                        hideOverlay(div)
                    });
                });
                footer.appendChild(unzipButton);
            }

            if (file.folder && file.folder !== currentPath) {
                const fileInfoElement = document.createElement('p');

                const label = document.createElement('span');
                label.innerText = '所在目录: ';
                label.style = 'font-size: 10px; color: #666;';

                const value = document.createElement('a');
                value.innerText = `/${file.folder}`
                value.style = 'font-size: 10px;color: blue;text-decoration: underline;';

                value.addEventListener('click', (e) => {
                    e.stopPropagation()
                    loadMedia(file.folder);
                });

                fileInfoElement.append(label)
                fileInfoElement.append(value)
                div.appendChild(fileInfoElement);
            }

            if (file.type !== 'folder' && fileExt === 'txt') {
                div.addEventListener('click', (e) => {
                    e.stopPropagation()
                    viewTextFile(`${file.folder || currentPath}/${filename}`, 0, 18);
                });
                div.classList.add('touchable')

                const convertBtn = document.createElement('button');
                convertBtn.innerText = '转换编码';
                convertBtn.className = 'warn-button'
                convertBtn.addEventListener('click', (event) => {
                    event.stopPropagation()
                    showOverlay(div, '编码转换中...')
                    convertEncoding(`${file.folder || currentPath}/${filename}`).then((data) => {
                        if (data.success) {
                            showToast('转换编码成功', 'success')
                        } else {
                            showToast(data.message, 'warn')
                        }
                    }).finally(() => {
                        hideOverlay(div)
                    })
                });
                footer.appendChild(convertBtn);
            }

            if (file.type !== 'folder' && ['mp3', 'wav'].includes(fileExt)) {
                const audioPlayer = document.createElement('audio');
                audioPlayer.classList.add('audio-player');
                audioPlayer.controls = true;
                audioPlayer.src = baseServer + file.filename;
                div.appendChild(audioPlayer);
            }

            const moveButton = document.createElement('button');
            moveButton.innerText = '移动';
            moveButton.className = 'warn-button';
        
            moveButton.addEventListener('click', (e) => {
                e.stopPropagation();
                let targetFolder = prompt('请输入目标文件夹', latestCopiedText || '');
                targetFolder = targetFolder && targetFolder.trim()
                if (!targetFolder) {
                    showToast('目标文件及不能为空', 'warn');
                } else if (targetFolder === (file.folder || currentPath)) {
                    showToast('不能移动到相同目录', 'warn');
                } else {
                    if (file.type === 'folder') {
                        moveFileOrFolder(file.filename, targetFolder, file.folder || currentPath);
                    } else {
                        moveFileOrFolder(filename, targetFolder, file.folder || currentPath);
                    }
                }
            });

            footer.appendChild(moveButton)

            if (file.type !== 'folder') {
                const a = document.createElement('a');
                a.innerHTML = '下载';
                a.href = baseServer + file.filename;
                a.download = filename;
                a.onclick = (e) => e.stopPropagation()
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
            const response = await fetch(`${baseServer}/rename`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ oldName: filename, newName: newFilename, path, type })
            });
            if(response.status === 200) {
                showToast('File renamed successfully.', 'success');
                deleteCache(path)
                loadMedia(path); // 重新加载媒体列表
            } else {
                const data = await response.json();
                showToast(data.message, 'warn')
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
            const response = await fetch(`${baseServer}/createFolder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ folderName, path: currentPath })
            });
            if(response.status === 200) {
                showToast('Folder created successfully.','success');
                deleteCache(currentPath)
                loadMedia(currentPath); // 重新加载媒体列表
            } else {
                const data = await response.json();
                showToast(data.message, 'warn')
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
                const response = await fetch(`${baseServer}/delete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ filename, path, type })
                });
                if (response.status === 200) {
                    showToast('File deleted successfully.','success');
                    deleteCache(currentPath)
                    loadMedia(currentPath); // 重新加载媒体列表
                } else {
                    const data = await response.json();
                    showToast(data.message, 'warn')
                }
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
                deleteCache(currentPath)
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
        const url = `${baseServer}/upload?path=${encodeURIComponent(currentPath)}`;
        xhr.open('POST', url);

        try {
            // 发送上传请求
            xhr.send(formData);
        } catch (error) {
            console.error('Error sending request:', error);
        }
    }
    function moveFileOrFolder(filename, targetFolder, currentPath) {
        const url = `${baseServer}/move`;
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
                deleteCache(currentPath)
                deleteCache(targetFolder.replace(/^\/+/, ''))
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

    function convertFile(inputFilePath, outputFilePath) {
        const url = `${baseServer}/convert`;
        
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputFilePath, outputFilePath }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.outputFilePath) {
                deleteCache(currentPath)
                loadMedia(currentPath);
                showToast('File converted successfully.', 'success');
            } else {
                showToast(data.message, 'warn');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('Error during conversion', 'error');
        });
    }

    function showOverlay(div, text) {
        if (!div.__mOverlay) {
            const container = div;
            const loadingOverlay = document.createElement('div');
            loadingOverlay.classList.add('loading-overlay');
            loadingOverlay.innerText = text || '加载中...';
            div.__mOverlay = loadingOverlay;
            container.appendChild(loadingOverlay);
        }
        div.__mOverlay.style.display = 'flex';
    }

    function hideOverlay(div) {
        if(div.__mOverlay) {
            div.__mOverlay.style.display = 'none';
        }
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

    function copyText(div) {
        const txt = div.innerText
        copyToClipboard(txt);
        latestCopiedText = txt
    }

    function copyToClipboard(text) {    
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() {
                showToast('复制成功', 'success');
            }).catch(function(err) {
                console.error('navigator.clipboard 写入失败: ', err);
                fallbackCopyToClipboard(text);
            });
        } else {
            fallbackCopyToClipboard(text);
        }

        function fallbackCopyToClipboard(text) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';  // 避免页面滚动
            textarea.style.top = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, 99999); // 适配移动设备
            try {
                document.execCommand('copy');
                showToast('复制成功', 'success');
            } catch (err) {
                showToast('复制失败', 'warn');
            }
            document.body.removeChild(textarea);
        }
    }

    function unzipFile(zipFilePath) {
        return fetch('/unzip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ zipFilePath })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast(data.message, 'success');
                deleteCache(currentPath)
                loadMedia(currentPath); // 更新显示
            } else {
                showToast(data.message, 'warn')
            }
        })
        .catch(error => {
            console.error('Error during unzipping:', error);
            showToast('Unzipping failed', 'error');
        });
    }

    function getTxtContent(filePath, start, numLines) {
        return fetch('/readTextFile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                'Accept-Language': 'en,zh-cn'
            },
            body: JSON.stringify({ filePath, start, numLines, encoding: 'utf8' })
        })
        .then(response => response.json())
        .catch(error => {
            console.error('Error reading file:', error);
            showToast('Error reading file', 'error');
        });
    }

    function convertEncoding(filePath) {
        return fetch('/convertTxtEncoding', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                'Accept-Language': 'en,zh-cn'
            },
            body: JSON.stringify({ filePath })
        })
        .then(response => {
            return response.json()
        })
        .catch(error => {
            console.error('Error convert encoding:', error);
            showToast('Error convert encoding', 'error');
        });
    }

    function viewTextFile(filePath, start, numLines) {
        return getTxtContent(filePath, start, numLines).then((data) => {
            if (data.content) {
                openTxtModal(data.content, filePath, data.start, data.numLines)
            } else {
                showToast(data.message, 'error');
            }
        })
    }

    function openImgModal(img) {
        const modal = document.getElementById("myModal");
        const modalImg = document.getElementById("img01");
    
        modal.style.display = "block";
        modalImg.src = img.src;
    }

    function openTxtModal(txt, filePath, nextStart, numLines) {
        const modal = document.getElementById("txtModal");
        const modalTxt = document.getElementById("txtContent");
        const btnTxtModelNext = document.getElementById('btnTxtModelNext')
        const btnTxtModelClose = document.getElementById('btnTxtModelClose')
        const btnTxtModelJump = document.getElementById('btnTxtModelJump')
        const currPage = document.getElementById('currPage')
        const txtFileName = document.getElementById('txtFileName')

        txtFileName.innerText = filePath.substring(filePath.lastIndexOf('/') + 1)
    
        modal.style.display = "block";
        modalTxt.innerText = txt;
        modalTxt.__nextStart = nextStart;
        modalTxt.__numLines = numLines
        btnTxtModelNext.style.display = '';
        currPage.innerText = Math.ceil((nextStart / numLines))

        const txtContentCb = data => {
            if (data.content) {
                modalTxt.scrollTop = 0
                modalTxt.innerText = data.content;
                modalTxt.__nextStart = data.start;
                modalTxt.__numLines = data.numLines
                currPage.innerText = Math.ceil((modalTxt.__nextStart / modalTxt.__numLines))
                if(data.isLastPage) {
                    btnTxtModelNext.style.display = 'none';
                }
            } else {
                showToast(data.message, 'warn')
            }
        }

        btnTxtModelNext.onclick = () => {
            getTxtContent(filePath, modalTxt.__nextStart, modalTxt.__numLines).then(txtContentCb)
        }

        btnTxtModelJump.onclick = () => {
            let targetPage = prompt('请输入页码');
            targetPage = (targetPage || '').trim()
            const currPage = Math.ceil((modalTxt.__nextStart / modalTxt.__numLines))
            if (!targetPage) {
                showToast('页码不能为空', 'warn');
            } else if (targetPage === currPage) {
                showToast(`当前已是第${currPage}页`, 'warn');
            } else if (!/\d+/.test(targetPage)) {
                showToast(`页码必须为1数字`, 'warn');
            } else {
                const target = Number(targetPage)
                if(target > 100000) {
                    return showToast(`数值过大`, 'warn');
                }
                if (target <= 0) {
                    return showToast(`数值过小`, 'warn');
                }
                getTxtContent(filePath, (target - 1) * (modalTxt.__numLines), modalTxt.__numLines).then(txtContentCb)
            }
        }

        btnTxtModelClose.onclick = () => {
            closeModal(modal)
        }
    }

    function handleKeyPress(event) {
        if (event.key === 'Enter') {
            handleSearch();
        }
    }
    
    function closeModal(modal) {
        modal = modal || document.getElementById("myModal");
        modal.style.display = "none";
    }
    

    document.addEventListener('DOMContentLoaded', () => {
        loadMedia();
    });

    window.onresize = () => {
        checkAndRenderInitialFiles()
    }