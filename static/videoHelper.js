const videoHelper = {
    async loadTs(videoEle, videoUrl, onerror) {
        videoEle.__vpisLoading = true
        try {
            const data = await this.getVideoData(videoUrl);
            const { combined, outputType, bytes } = await this.transferFormat(data);
            await this.prepareSourceBuffer(combined, outputType, bytes, videoEle);
            videoEle.__vpisLoading = false
        } catch(e) {
            videoEle.__vpisLoading = false
            if (typeof onerror === 'function') {
                onerror(e)
            }
        }
    },

    play(videoEle) {
        if (videoEle.paused && this.isReady(videoEle) && !this.isLoading(videoEle)) {
            videoEle.play();
        }
    },

    isReady(videoEle) {
        return videoEle.src
    },

    isLoading(videoEle) {
        return videoEle.__vpisLoading
    },

    getVideoData(videoUrl) {
        return fetch(videoUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/octet-stream'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.arrayBuffer();
        })
        .then(data => data)
        .catch(error => {
            console.error('Fetch error:', error);
            throw error;
        });
    },

    transferFormat(data) {
        return new Promise((resolve, reject) => {
            const segment = new Uint8Array(data);
            const combined = true;
            const outputType = 'combined';
            let remuxedSegments = [];
            let remuxedBytesLength = 0;
            let remuxedInitSegment = null;

            const transmuxer = new muxjs.mp4.Transmuxer();

            transmuxer.on('data', (event) => {
                remuxedSegments.push(event);
                remuxedBytesLength += event.data.byteLength;
                remuxedInitSegment = event.initSegment;
            });

            transmuxer.on('done', () => {
                let offset = 0;
                const bytes = new Uint8Array(remuxedInitSegment.byteLength + remuxedBytesLength);
                bytes.set(remuxedInitSegment, offset);
                offset += remuxedInitSegment.byteLength;

                for (let i = 0, len = remuxedSegments.length; i < len; i++) {
                    bytes.set(remuxedSegments[i].data, offset);
                    offset += remuxedSegments[i].data.byteLength;
                }

                resolve({ combined, outputType, bytes });
            });

            transmuxer.push(segment);
            transmuxer.flush();
        });
    },

    prepareSourceBuffer(combined, outputType, bytes, videoEle) {
        return new Promise(resolve => {
            const video = videoEle;
            const mediaSource = new MediaSource();
            video.src = URL.createObjectURL(mediaSource);

            mediaSource.addEventListener('sourceopen', () => {
                let buffer;
                mediaSource.duration = 0;
                const codecsArray = ['avc1.64001f', 'mp4a.40.5'];

                if (combined) {
                    buffer = mediaSource.addSourceBuffer('video/mp4;codecs="avc1.64001f,mp4a.40.5"');
                } else if (outputType === 'video') {
                    buffer = mediaSource.addSourceBuffer('video/mp4;codecs="' + codecsArray[0] + '"');
                } else if (outputType === 'audio') {
                    buffer = mediaSource.addSourceBuffer('audio/mp4;codecs="' + (codecsArray[1] || codecsArray[0]) + '"');
                }

                buffer.addEventListener('updateend', () => {
                    buffer.abort();
                    mediaSource.endOfStream();
                });

                buffer.appendBuffer(bytes);
                resolve()
            });
        })
    }
};
