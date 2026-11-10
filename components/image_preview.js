/**
 * 图片预览组件
 * 支持放大缩小、旋转、键盘快捷键等功能
 */
class ImagePreview {
    constructor(options = {}) {
        this.options = {
            minScale: 0.1,
            maxScale: 5,
            scaleStep: 0.2,
            enableKeyboard: true,
            enableWheel: true,
            showControls: true,
            showInfo: true,
            ...options
        };
        
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.rotation = 0; // 旋转角度
        this.currentImage = null;
        
        // 移动端触摸相关
        this.touches = [];
        this.lastTouchDistance = 0;
        this.lastTouchAngle = 0; // 新增旋转角度跟踪
        this.lastTouchTime = 0;
        this.touchStartTime = 0;
        this.isTouching = false;

        // 拖拽相关
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastTranslateX = 0;
        this.lastTranslateY = 0;

        // 性能优化
        this.animationFrame = null;
        
        this.init();
    }
    
    init() {
        this.createModal();
        this.bindEvents();
    }
    
    createModal() {
        // 创建模态框HTML结构
        const modalHTML = `
            <div class="image-preview-modal" id="imagePreviewModal">
                <div class="image-preview-container">
                    <div class="image-preview-close" id="imagePreviewClose">&times;</div>
                    
                    <div class="image-preview-loading" id="imagePreviewLoading" style="display: none;">
                        <div class="image-preview-spinner"></div>
                        <div>加载中...</div>
                    </div>
                    
                    <div class="image-preview-content" id="imagePreviewContent">
                        <img class="image-preview-img" id="imagePreviewImg" alt="预览图片">
                    </div>
                    
                    ${this.options.showInfo ? `
                    <div class="image-preview-info" id="imagePreviewInfo">
                        <div>缩放: <span id="imagePreviewScale">100%</span></div>
                    </div>
                    ` : ''}
                    
                    ${this.options.showControls ? `
                    <div class="image-preview-controls">
                        <button class="image-preview-btn" id="imagePreviewZoomOut" title="缩小 (-)">
                            <span>-</span>
                        </button>
                        <button class="image-preview-btn" id="imagePreviewReset" title="重置 (0)">
                            <span>1:1</span>
                        </button>
                        <button class="image-preview-btn" id="imagePreviewZoomIn" title="放大 (+)">
                            <span>+</span>
                        </button>
                        <button class="image-preview-btn" id="imagePreviewRotateLeft" title="逆时针旋转 (R)">
                            <span>↺</span>
                        </button>
                        <button class="image-preview-btn" id="imagePreviewRotateRight" title="顺时针旋转 (T)">
                            <span>↻</span>
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // 添加到页面
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // 获取元素引用
        this.modal = document.getElementById('imagePreviewModal');
        this.container = this.modal.querySelector('.image-preview-container');
        this.content = document.getElementById('imagePreviewContent');
        this.img = document.getElementById('imagePreviewImg');
        this.closeBtn = document.getElementById('imagePreviewClose');
        this.loading = document.getElementById('imagePreviewLoading');
        
        if (this.options.showInfo) {
            this.info = document.getElementById('imagePreviewInfo');
            this.scaleDisplay = document.getElementById('imagePreviewScale');
        }
        
        if (this.options.showControls) {
            this.zoomInBtn = document.getElementById('imagePreviewZoomIn');
            this.zoomOutBtn = document.getElementById('imagePreviewZoomOut');
            this.resetBtn = document.getElementById('imagePreviewReset');
            this.rotateLeftBtn = document.getElementById('imagePreviewRotateLeft');
            this.rotateRightBtn = document.getElementById('imagePreviewRotateRight');
        }
    }
    
    bindEvents() {
        // 关闭按钮
        this.closeBtn.addEventListener('click', () => this.close());
        
        // 点击背景关闭
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal || e.target === this.container) {
                this.close();
            }
        });
        
        // 控制按钮事件
        if (this.options.showControls) {
            this.zoomInBtn.addEventListener('click', () => this.zoomIn());
            this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
            this.resetBtn.addEventListener('click', () => this.reset());
            this.rotateLeftBtn.addEventListener('click', () => this.rotateCounterClockwise());
            this.rotateRightBtn.addEventListener('click', () => this.rotateClockwise());
        }
        
        // 鼠标滚轮缩放
        if (this.options.enableWheel) {
            this.content.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -this.options.scaleStep : this.options.scaleStep;
                this.zoom(delta, e.clientX, e.clientY);
            });
        }
        
        // 移动端触摸事件（支持拖拽、缩放和旋转）
        this.content.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.content.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.content.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

        // 鼠标拖拽事件
        this.content.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));

        // 键盘快捷键
        if (this.options.enableKeyboard) {
            document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        }
        
        // 图片加载事件
        this.img.addEventListener('load', () => {
            this.hideLoading();
            this.reset(); // 默认100%缩放
        });
        
        this.img.addEventListener('error', () => {
            this.hideLoading();
            this.showError('图片加载失败');
        });
    }
    
    // 显示图片
    show(imageSrc, title = '') {
        this.currentImage = imageSrc;
        this.showLoading();
        this.modal.style.display = 'block';

        // 添加显示动画类
        setTimeout(() => {
            this.modal.classList.add('show');
        }, 10);

        // 重置状态到100%缩放
        this.reset();

        // 设置图片源
        this.img.src = imageSrc;

        // 设置鼠标样式表示可拖拽
        this.content.style.cursor = 'grab';
        this.img.style.cursor = 'grab';

        // 阻止页面滚动
        document.body.style.overflow = 'hidden';

        // 移动端优化
        if (this.isMobile()) {
            // 防止页面缩放
            this.preventZoom();
            // 隐藏地址栏
            this.hideAddressBar();
        }
    }
    
    // 关闭预览
    close() {
        // 移除显示动画类
        this.modal.classList.remove('show');

        // 延迟隐藏模态框，让动画完成
        setTimeout(() => {
            this.modal.style.display = 'none';
        }, 300);

        document.body.style.overflow = '';

        // 清理拖拽状态
        this.isDragging = false;

        // 移动端优化清理
        if (this.isMobile()) {
            this.restoreZoom();
        }
    }
    
    // 放大
    zoomIn() {
        this.zoom(this.options.scaleStep);
    }
    
    // 缩小
    zoomOut() {
        this.zoom(-this.options.scaleStep);
    }
    
    // 缩放
    zoom(delta, centerX = null, centerY = null) {
        const newScale = Math.max(this.options.minScale, 
                         Math.min(this.options.maxScale, this.scale + delta));
        
        if (newScale !== this.scale) {
            // 如果指定了缩放中心点，计算偏移
            if (centerX !== null && centerY !== null) {
                const rect = this.content.getBoundingClientRect();
                const offsetX = centerX - rect.left - rect.width / 2;
                const offsetY = centerY - rect.top - rect.height / 2;
                
                const scaleRatio = newScale / this.scale;
                this.translateX = this.translateX * scaleRatio - offsetX * (scaleRatio - 1);
                this.translateY = this.translateY * scaleRatio - offsetY * (scaleRatio - 1);
            }
            
            this.scale = newScale;
            this.updateTransform();
        }
    }
    
    // 重置
    reset() {
        this.scale = 1;
        this.translateX = 0;
        this.translateY = 0;
        this.rotation = 0;
        this.updateTransform();
    }
    
    // 适应窗口
    fitToWindow() {
        if (!this.img.naturalWidth || !this.img.naturalHeight) return;

        const containerRect = this.content.getBoundingClientRect();
        const imgAspect = this.img.naturalWidth / this.img.naturalHeight;
        const containerAspect = containerRect.width / containerRect.height;

        let scale;
        if (imgAspect > containerAspect) {
            scale = containerRect.width / this.img.naturalWidth;
        } else {
            scale = containerRect.height / this.img.naturalHeight;
        }

        this.scale = Math.max(this.options.minScale,
                      Math.min(this.options.maxScale, scale * 0.9));
        this.translateX = 0;
        this.translateY = 0;
        this.rotation = 0;
        this.updateTransform();
    }

    // 顺时针旋转
    rotateClockwise() {
        this.rotation = (this.rotation + 90) % 360;
        this.updateTransform();
    }

    // 逆时针旋转
    rotateCounterClockwise() {
        this.rotation = (this.rotation - 90 + 360) % 360;
        this.updateTransform();
    }

    
    // 触摸开始
    handleTouchStart(e) {
        e.preventDefault();
        this.touches = Array.from(e.touches);
        this.touchStartTime = Date.now();
        this.isTouching = true;

        if (this.touches.length === 1) {
            // 单指拖拽
            this.isDragging = true;
            this.dragStartX = this.touches[0].clientX;
            this.dragStartY = this.touches[0].clientY;
            this.lastTranslateX = this.translateX;
            this.lastTranslateY = this.translateY;
        } else if (this.touches.length === 2) {
            // 双指缩放和旋转
            this.lastTouchDistance = this.getTouchDistance(this.touches[0], this.touches[1]);

            // 防止页面缩放
            if (this.isMobile()) {
                e.preventDefault();
            }
        }
    }
    
    // 触摸移动
    handleTouchMove(e) {
        e.preventDefault();

        if (!this.isTouching) return;

        const currentTouches = Array.from(e.touches);

        if (currentTouches.length === 1 && this.isDragging) {
            // 单指拖拽
            const deltaX = currentTouches[0].clientX - this.dragStartX;
            const deltaY = currentTouches[0].clientY - this.dragStartY;

            this.translateX = this.lastTranslateX + deltaX;
            this.translateY = this.lastTranslateY + deltaY;

            this.updateTransform();
        } else if (currentTouches.length === 2 && this.touches.length === 2) {
            // 双指缩放和旋转
            const currentDistance = this.getTouchDistance(currentTouches[0], currentTouches[1]);
            const scaleChange = currentDistance / this.lastTouchDistance;

            // 处理缩放
            if (Math.abs(scaleChange - 1) > 0.01) {
                const centerX = (currentTouches[0].clientX + currentTouches[1].clientX) / 2;
                const centerY = (currentTouches[0].clientY + currentTouches[1].clientY) / 2;

                const delta = (scaleChange - 1) * this.scale;
                this.zoom(delta, centerX, centerY);

                this.lastTouchDistance = currentDistance;
            }
        }

        this.touches = currentTouches;
    }
    
    // 触摸结束
    handleTouchEnd(e) {
        e.preventDefault();

        const touchEndTime = Date.now();
        const touchDuration = touchEndTime - this.touchStartTime;

        // 结束拖拽
        if (this.isDragging) {
            this.isDragging = false;
        }

        // 检测双击（仅在非拖拽状态下）
        if (!this.isDragging && this.touches.length === 1 && touchDuration < 300) {
            const timeSinceLastTouch = touchEndTime - this.lastTouchTime;
            if (timeSinceLastTouch < 300 && timeSinceLastTouch > 0) {
                // 双击事件
                this.handleDoubleTap();
            }
            this.lastTouchTime = touchEndTime;
        }

        this.touches = Array.from(e.touches);
        this.isTouching = this.touches.length > 0;
    }
    
    // 获取两点间距离
    getTouchDistance(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // 获取两点间角度
    getTouchAngle(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.atan2(dy, dx) * (180 / Math.PI);
    }
    
    // 双击处理
    handleDoubleTap() {
        if (this.scale === 1) {
            // 放大到2倍
            this.scale = 2;
            this.updateTransform();
        } else {
            // 重置到1倍
            this.reset();
        }
    }
    
    // 检测是否为移动设备
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               ('ontouchstart' in window) ||
               (navigator.maxTouchPoints > 0);
    }
    
    // 防止页面缩放
    preventZoom() {
        // 保存原始viewport设置
        this.originalViewport = document.querySelector('meta[name="viewport"]');
        
        // 创建或更新viewport meta标签
        let viewport = this.originalViewport;
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = 'viewport';
            document.head.appendChild(viewport);
        }
        
        this.originalViewportContent = viewport.content;
        viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    }
    
    // 恢复页面缩放
    restoreZoom() {
        if (this.originalViewport && this.originalViewportContent) {
            this.originalViewport.content = this.originalViewportContent;
        }
    }
    
    // 隐藏地址栏（仅在某些移动浏览器中有效）
    hideAddressBar() {
        setTimeout(() => {
            if (window.scrollTo) {
                window.scrollTo(0, 1);
                window.scrollTo(0, 0);
            }
        }, 100);
    }
    
    // 键盘事件处理
    handleKeyboard(e) {
        if (this.modal.style.display !== 'block') return;

        switch(e.key) {
            case 'Escape':
                this.close();
                break;
            case '+':
            case '=':
                e.preventDefault();
                this.zoomIn();
                break;
            case '-':
                e.preventDefault();
                this.zoomOut();
                break;
            case '0':
                e.preventDefault();
                this.reset();
                break;
            case 'r':
            case 'R':
                e.preventDefault();
                this.rotateCounterClockwise();
                break;
            case 't':
            case 'T':
                e.preventDefault();
                this.rotateClockwise();
                break;
        }
    }
    
    // 更新变换
    updateTransform() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        this.animationFrame = requestAnimationFrame(() => {
            this.img.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale}) rotate(${this.rotation}deg)`;

            if (this.options.showInfo && this.scaleDisplay) {
                this.scaleDisplay.textContent = Math.round(this.scale * 100) + '%';
            }

            this.animationFrame = null;
        });
    }
    
    // 显示加载状态
    showLoading() {
        if (this.loading) {
            this.loading.style.display = 'block';
            // 强制重绘以触发动画
            this.loading.offsetHeight;
            this.loading.classList.add('show');
        }
    }

    // 隐藏加载状态
    hideLoading() {
        if (this.loading) {
            this.loading.classList.remove('show');
            // 延迟隐藏，让动画完成
            setTimeout(() => {
                this.loading.style.display = 'none';
            }, 300);
        }
    }
    
    // 显示错误
    showError(message) {
        if (this.loading) {
            this.loading.innerHTML = `<div style="color: #ff4444;">${message}</div>`;
        }
    }
    
    // 鼠标按下开始拖拽
    handleMouseDown(e) {
        if (e.button !== 0) return; // 只响应左键

        e.preventDefault();
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.lastTranslateX = this.translateX;
        this.lastTranslateY = this.translateY;

        // 改变鼠标样式
        this.content.style.cursor = 'grabbing';
        this.img.style.cursor = 'grabbing';
    }

    // 鼠标移动拖拽
    handleMouseMove(e) {
        if (!this.isDragging) return;

        e.preventDefault();
        const deltaX = e.clientX - this.dragStartX;
        const deltaY = e.clientY - this.dragStartY;

        this.translateX = this.lastTranslateX + deltaX;
        this.translateY = this.lastTranslateY + deltaY;

        this.updateTransform();
    }

    // 鼠标释放结束拖拽
    handleMouseUp(e) {
        if (!this.isDragging) return;

        this.isDragging = false;

        // 恢复鼠标样式
        this.content.style.cursor = 'grab';
        this.img.style.cursor = 'grab';
    }

    // 限制拖拽边界
    constrainDrag() {
        if (!this.img.naturalWidth || !this.img.naturalHeight) return;

        const containerRect = this.content.getBoundingClientRect();

        // 计算图片在当前缩放下的实际尺寸
        const scaledWidth = this.img.naturalWidth * this.scale;
        const scaledHeight = this.img.naturalHeight * this.scale;

        // 计算边界限制
        if (scaledWidth <= containerRect.width && scaledHeight <= containerRect.height) {
            // 图片同时小于容器的宽和高 - 图片可以自由拖拽，但不能完全移出容器
            const maxTranslateX = (containerRect.width - scaledWidth) / 2;
            const minTranslateX = -maxTranslateX;
            const maxTranslateY = (containerRect.height - scaledHeight) / 2;
            const minTranslateY = -maxTranslateY;

            this.translateX = Math.max(minTranslateX, Math.min(maxTranslateX, this.translateX));
            this.translateY = Math.max(minTranslateY, Math.min(maxTranslateY, this.translateY));
        } else {
            // 图片大于容器 - 传统拖拽逻辑，防止容器显示空白
            const maxTranslateX = Math.max(0, (scaledWidth - containerRect.width) / 2);
            const minTranslateX = -maxTranslateX;
            const maxTranslateY = Math.max(0, (scaledHeight - containerRect.height) / 2);
            const minTranslateY = -maxTranslateY;

            this.translateX = Math.max(minTranslateX, Math.min(maxTranslateX, this.translateX));
            this.translateY = Math.max(minTranslateY, Math.min(maxTranslateY, this.translateY));
        }
    }

    // 销毁组件
    destroy() {
        // 取消动画帧
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (this.modal) {
            this.modal.remove();
        }
    }
}

// 全局实例
let globalImagePreview = null;

// 便捷函数
function showImagePreview(imageSrc, title = '') {
    if (!globalImagePreview) {
        globalImagePreview = new ImagePreview();
    }
    globalImagePreview.show(imageSrc, title);
}

// 自动绑定点击事件
document.addEventListener('DOMContentLoaded', function() {
    // 为所有带有 data-preview 属性的图片添加预览功能
    document.addEventListener('click', function(e) {
        const img = e.target.closest('[data-preview]');
        if (img) {
            e.preventDefault();
            const src = img.getAttribute('data-preview') || img.src || img.getAttribute('href');
            if (src) {
                showImagePreview(src, img.alt || img.title || '');
            }
        }
    });
});

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImagePreview;
}
if (typeof window !== 'undefined') {
    window.ImagePreview = ImagePreview;
    window.showImagePreview = showImagePreview;
}