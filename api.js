// API配置
const COZE_CONFIG = {
    url: 'https://api.coze.cn/v3/chat',
    token: process.env.COZE_TOKEN || 'pat_owL8mXroakuymBvJFPOJ0vRAWnqwXkx510fxeFivvAgdEE5zEIG1BzLUgtkAhmoc',
    botId: process.env.COZE_BOT_ID || '7463319246924480512',
    userId: process.env.COZE_USER_ID || '123456789'
};

const GLM_CONFIG = {
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKey: process.env.GLM_API_KEY || 'd014614670254576a1bb469f3924f2db.BxVhT99E6Cc6gNYP'
};

// 生成道歉语
async function generateApology() {
    try {
        const response = await fetch(GLM_CONFIG.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GLM_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: "glm-4",
                messages: [
                    {
                        role: "system",
                        content: "你是一个善解人意的朋友，请用温柔可爱的语气生成一句道歉的话。要体现出诚恳、可爱和撒娇的感觉。对象是娜娜。"
                    },
                    {
                        role: "user",
                        content: "请生成一句道歉的话"
                    }
                ],
                temperature: 0.7,
                max_tokens: 100
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('生成道歉语失败:', error);
        return "娜娜，对不起，我错了，请原谅我好不好？🥺"; // 默认道歉语
    }
}

// 从文本中提取URL
function extractUrls(text) {
    const urlRegex = /https?:\/\/[^\s)]+/g;
    return text.match(urlRegex) || [];
}

// 下载图片
async function downloadImage(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `表情包_${new Date().getTime()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
        console.error('下载图片失败:', error);
        alert('下载失败，请稍后重试');
    }
}

// 创建图片容器
async function createImageContainer(imageUrl) {
    const container = document.createElement('div');
    container.className = 'image-container';

    // 添加道歉语
    const apologyText = await generateApology();
    const apologyDiv = document.createElement('div');
    apologyDiv.className = 'apology-text';
    apologyDiv.textContent = apologyText;
    container.appendChild(apologyDiv);

    // 创建图片元素
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'generated-image';
    img.alt = '生成的表情包';

    // 创建下载按钮
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.textContent = '下载';
    downloadBtn.onclick = () => downloadImage(imageUrl);

    container.appendChild(img);
    container.appendChild(downloadBtn);
    return container;
}

// 处理流式返回的数据
function processStreamData(data) {
    try {
        // 将数据按行分割
        const lines = data.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            
            // 提取JSON数据
            const jsonStr = line.replace('data:', '').trim();
            if (jsonStr === '[DONE]') {
                return { done: true, content: '' };
            }
            
            const eventData = JSON.parse(jsonStr);
            
            // 处理completed消息中的链接
            if (eventData.type === 'tool_response') {
                try {
                    const responseData = JSON.parse(eventData.content);
                    if (responseData.output && responseData.output.startsWith('https://')) {
                        return {
                            done: false,
                            content: responseData.output
                        };
                    }
                } catch (e) {
                    console.error('解析tool_response失败:', e);
                }
            }
            // 处理answer类型消息中的链接
            else if (eventData.type === 'answer') {
                const urls = extractUrls(eventData.content);
                if (urls.length > 0) {
                    return {
                        done: false,
                        content: urls[0] // 返回第一个找到的URL
                    };
                }
            }
        }
        
        return { done: false, content: '' };
    } catch (error) {
        console.error('处理流数据时出错:', error);
        return { done: false, content: '' };
    }
}

async function sendMessage() {
    const inputElement = document.getElementById('input');
    const responseElement = document.getElementById('response');
    const message = inputElement.value.trim();
    
    if (!message) {
        alert('请输入表情包描述！');
        return;
    }

    // 清空之前的响应
    responseElement.innerHTML = '<div class="loading">正在生成表情包，请稍候...</div>';
    let finalResponse = '';

    try {
        // 创建请求数据
        const requestData = {
            bot_id: COZE_CONFIG.botId,
            user_id: COZE_CONFIG.userId,
            stream: true,
            auto_save_history: true,
            additional_messages: [
                {
                    role: 'user',
                    content: message,
                    content_type: 'text'
                }
            ]
        };

        // 发起fetch请求
        const response = await fetch(COZE_CONFIG.url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${COZE_CONFIG.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // 获取响应的ReadableStream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // 循环读取流数据
        while (true) {
            const {done, value} = await reader.read();
            
            if (done) {
                break;
            }
            
            // 解码数据
            const chunk = decoder.decode(value);
            const result = processStreamData(chunk);
            
            if (result.content && !finalResponse) {
                finalResponse = result.content;
                responseElement.innerHTML = ''; // 清空loading消息
                const imageContainer = await createImageContainer(finalResponse);
                responseElement.appendChild(imageContainer);
            }
            
            if (result.done) {
                break;
            }
        }

        if (!finalResponse) {
            responseElement.innerHTML = '<div class="loading">未能生成表情包，请重试</div>';
        }

    } catch (error) {
        console.error('Error:', error);
        responseElement.innerHTML = `<div class="loading">发生错误: ${error.message}</div>`;
    }
}

// 添加回车键发送功能
document.getElementById('input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
