// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext } from '../../../extensions.js';
//You'll likely need to import some other functions from the main script
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
    updateMessageBlock,
} from '../../../../script.js';
import { appendMediaToMessage } from '../../../../script.js';
import { regexFromString } from '../../../utils.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';

// 扩展名称和路径
const extensionName = 'st-image-auto-generation';
// /scripts/extensions/third-party
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

// 插入类型常量
const INSERT_TYPE = {
    DISABLED: 'disabled',
    INLINE: 'inline',
    NEW_MESSAGE: 'new',
    REPLACE: 'replace',
};

/**
 * Escapes characters for safe inclusion inside HTML attribute values.
 * @param {string} value
 * @returns {string}
 */
function escapeHtmlAttribute(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Reverses {@link escapeHtmlAttribute} to recover the original prompt text.
 * @param {string} value
 * @returns {string}
 */
function unescapeHtmlAttribute(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&'); // 必须放在最后，避免二次反转义
}

/**
 * Converts the <img> tags this extension generated in REPLACE mode back into
 * their original <pic prompt="..."> form. Only tags carrying our data-pic-gen
 * marker are touched, so user/character images are left untouched.
 * @param {string} content
 * @returns {string}
 */
function restorePicTags(content) {
    return content.replace(
        /<img\b[^>]*?\sdata-pic-gen="([^"]*)"[^>]*>/g,
        (_match, escapedPrompt) =>
            `<pic prompt="${unescapeHtmlAttribute(escapedPrompt)}">`,
    );
}

/**
 * Ensures message.extra.image_swipes always exists and is an array.
 * @param {any} message
 * @returns {string[]}
 */
function ensureImageSwipes(message) {
    if (!message.extra || typeof message.extra !== 'object') {
        message.extra = {};
    }

    if (!Array.isArray(message.extra.image_swipes)) {
        message.extra.image_swipes = [];
    }

    return message.extra.image_swipes;
}

// 默认设置
const defaultSettings = {
    insertType: INSERT_TYPE.DISABLED,
    promptInjection: {
        enabled: true,
        prompt: `<image_generation>
You must insert a <pic prompt="example prompt"> at end of the reply. Prompts are used for stable diffusion image generation, based on the plot and character to output appropriate prompts to generate captivating images.
</image_generation>`,
        regex: '/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g',
        position: 'deep_system', // deep_system, deep_user, deep_assistant
        depth: 0, // 0表示添加到末尾，>0表示从末尾往前数第几个位置
    },
};

// 从设置更新UI
function updateUI() {
    // 根据insertType设置开关状态
    $('#auto_generation').toggleClass(
        'selected',
        extension_settings[extensionName].insertType !== INSERT_TYPE.DISABLED,
    );

    // 只在表单元素存在时更新它们
    if ($('#image_generation_insert_type').length) {
        $('#image_generation_insert_type').val(
            extension_settings[extensionName].insertType,
        );
        $('#prompt_injection_enabled').prop(
            'checked',
            extension_settings[extensionName].promptInjection.enabled,
        );
        $('#prompt_injection_text').val(
            extension_settings[extensionName].promptInjection.prompt,
        );
        $('#prompt_injection_regex').val(
            extension_settings[extensionName].promptInjection.regex,
        );
        $('#prompt_injection_position').val(
            extension_settings[extensionName].promptInjection.position,
        );
        $('#prompt_injection_depth').val(
            extension_settings[extensionName].promptInjection.depth,
        );
    }
}

// 加载设置
async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    // 如果设置为空或缺少必要属性，使用默认设置
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    } else {
        // 确保promptInjection对象存在
        if (!extension_settings[extensionName].promptInjection) {
            extension_settings[extensionName].promptInjection =
                defaultSettings.promptInjection;
        } else {
            // 确保promptInjection的所有子属性都存在
            const defaultPromptInjection = defaultSettings.promptInjection;
            for (const key in defaultPromptInjection) {
                if (
                    extension_settings[extensionName].promptInjection[key] ===
                    undefined
                ) {
                    extension_settings[extensionName].promptInjection[key] =
                        defaultPromptInjection[key];
                }
            }
        }

        // 确保insertType属性存在
        if (extension_settings[extensionName].insertType === undefined) {
            extension_settings[extensionName].insertType =
                defaultSettings.insertType;
        }
    }

    updateUI();
}

// 创建设置页面
async function createSettings(settingsHtml) {
    // 创建一个容器来存放设置，确保其正确显示在扩展设置面板中
    if (!$('#image_auto_generation_container').length) {
        $('#extensions_settings2').append(
            '<div id="image_auto_generation_container" class="extension_container"></div>',
        );
    }

    // 使用传入的settingsHtml而不是重新获取
    $('#image_auto_generation_container').empty().append(settingsHtml);

    // 添加设置变更事件处理
    $('#image_generation_insert_type').on('change', function () {
        const newValue = $(this).val();
        extension_settings[extensionName].insertType = newValue;
        updateUI();
        saveSettingsDebounced();
    });

    // 添加提示词注入设置的事件处理
    $('#prompt_injection_enabled').on('change', function () {
        extension_settings[extensionName].promptInjection.enabled =
            $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#prompt_injection_text').on('input', function () {
        extension_settings[extensionName].promptInjection.prompt =
            $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_regex').on('input', function () {
        extension_settings[extensionName].promptInjection.regex = $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_position').on('change', function () {
        extension_settings[extensionName].promptInjection.position =
            $(this).val();
        saveSettingsDebounced();
    });

    // 深度设置事件处理
    $('#prompt_injection_depth').on('input', function () {
        const value = parseInt(String($(this).val()));
        extension_settings[extensionName].promptInjection.depth = isNaN(value)
            ? 0
            : value;
        saveSettingsDebounced();
    });

    // 初始化设置值
    updateUI();
}

// 设置变更处理函数
function onExtensionButtonClick() {
    // 直接访问扩展设置面板
    const extensionsDrawer = $('#extensions-settings-button .drawer-toggle');

    // 如果抽屉是关闭的，点击打开它
    if ($('#rm_extensions_block').hasClass('closedDrawer')) {
        extensionsDrawer.trigger('click');
    }

    // 等待抽屉打开后滚动到我们的设置容器
    setTimeout(() => {
        // 找到我们的设置容器
        const container = $('#image_auto_generation_container');
        if (container.length) {
            // 滚动到设置面板位置
            $('#rm_extensions_block').animate(
                {
                    scrollTop:
                        container.offset().top -
                        $('#rm_extensions_block').offset().top +
                        $('#rm_extensions_block').scrollTop(),
                },
                500,
            );

            // 使用SillyTavern原生的抽屉展开方式
            // 检查抽屉内容是否可见
            const drawerContent = container.find('.inline-drawer-content');
            const drawerHeader = container.find('.inline-drawer-header');

            // 只有当内容被隐藏时才触发展开
            if (drawerContent.is(':hidden') && drawerHeader.length) {
                // 直接使用原生点击事件触发，而不做任何内部处理
                drawerHeader.trigger('click');
            }
        }
    }, 500);
}

// 初始化扩展
$(function () {
    (async function () {
        // 获取设置HTML (只获取一次)
        const settingsHtml = await $.get(
            `${extensionFolderPath}/settings.html`,
        );

        // 添加扩展到菜单
        $('#extensionsMenu')
            .append(`<div id="auto_generation" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-robot"></div>
            <span data-i18n="Image Auto Generation">Image Auto Generation</span>
        </div>`);

        // 修改点击事件，打开设置面板而不是切换状态
        $('#auto_generation').off('click').on('click', onExtensionButtonClick);

        await loadSettings();

        // 创建设置 - 将获取的HTML传递给createSettings
        await createSettings(settingsHtml);

        // 确保设置面板可见时，设置值是正确的
        $('#extensions-settings-button').on('click', function () {
            setTimeout(() => {
                updateUI();
            }, 200);
        });
    })();
});
// 获取消息角色
function getMesRole() {
    // 确保对象路径存在
    if (
        !extension_settings[extensionName] ||
        !extension_settings[extensionName].promptInjection ||
        !extension_settings[extensionName].promptInjection.position
    ) {
        return 'system'; // 默认返回system角色
    }

    switch (extension_settings[extensionName].promptInjection.position) {
        case 'deep_system':
            return 'system';
        case 'deep_user':
            return 'user';
        case 'deep_assistant':
            return 'assistant';
        default:
            return 'system';
    }
}

// 监听CHAT_COMPLETION_PROMPT_READY事件以注入提示词
eventSource.on(
    event_types.CHAT_COMPLETION_PROMPT_READY,
    async function (eventData) {
        try {
            // 扩展被禁用时不做任何处理
            if (
                !extension_settings[extensionName] ||
                extension_settings[extensionName].insertType ===
                    INSERT_TYPE.DISABLED
            ) {
                return;
            }

            // 行内替换模式下，将我们生成的 <img> 标签还原成 <pic prompt="...">，
            // 这样发送给模型的历史里只会出现 <pic> 标签，避免模型在多轮后学着直接输出 <img>。
            if (
                extension_settings[extensionName].insertType ===
                    INSERT_TYPE.REPLACE &&
                Array.isArray(eventData?.chat)
            ) {
                for (const entry of eventData.chat) {
                    if (
                        entry &&
                        typeof entry.content === 'string' &&
                        entry.content.includes('data-pic-gen=')
                    ) {
                        entry.content = restorePicTags(entry.content);
                    }
                }
            }

            // 提示词注入需要单独开启
            if (
                !extension_settings[extensionName].promptInjection ||
                !extension_settings[extensionName].promptInjection.enabled
            ) {
                return;
            }

            const prompt =
                extension_settings[extensionName].promptInjection.prompt;
            const depth =
                extension_settings[extensionName].promptInjection.depth || 0;
            const role = getMesRole();

            console.log(
                `[${extensionName}] 准备注入提示词: 角色=${role}, 深度=${depth}`,
            );
            console.log(
                `[${extensionName}] 提示词内容: ${prompt.substring(0, 50)}...`,
            );

            // 根据depth参数决定插入位置
            if (depth === 0) {
                // 添加到末尾
                eventData.chat.push({ role: role, content: prompt });
                console.log(`[${extensionName}] 提示词已添加到聊天末尾`);
            } else {
                // 从末尾向前插入
                eventData.chat.splice(-depth, 0, {
                    role: role,
                    content: prompt,
                });
                console.log(
                    `[${extensionName}] 提示词已插入到聊天中，从末尾往前第 ${depth} 个位置`,
                );
            }
        } catch (error) {
            console.error(`[${extensionName}] 提示词注入错误:`, error);
            toastr.error(`提示词注入错误: ${error}`);
        }
    },
);

// 监听消息接收事件
eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
async function handleIncomingMessage() {
    // 确保设置对象存在
    if (
        !extension_settings[extensionName] ||
        extension_settings[extensionName].insertType === INSERT_TYPE.DISABLED
    ) {
        return;
    }

    const context = getContext();
    const message = context.chat[context.chat.length - 1];

    // 检查是否是AI消息
    if (!message || message.is_user) {
        return;
    }

    // 确保promptInjection对象和regex属性存在
    if (
        !extension_settings[extensionName].promptInjection ||
        !extension_settings[extensionName].promptInjection.regex
    ) {
        console.error('Prompt injection settings not properly initialized');
        return;
    }

    // 使用正则表达式search
    const imgTagRegex = regexFromString(
        extension_settings[extensionName].promptInjection.regex,
    );
    // const testRegex = regexFromString(extension_settings[extensionName].promptInjection.regex);
    let matches;
    if (imgTagRegex.global) {
        matches = [...message.mes.matchAll(imgTagRegex)];
    } else {
        const singleMatch = message.mes.match(imgTagRegex);
        matches = singleMatch ? [singleMatch] : [];
    }
    console.log(imgTagRegex, matches);
    if (matches.length > 0) {
        // 延迟执行图片生成，确保消息首先显示出来
        setTimeout(async () => {
            try {
                toastr.info(`Generating ${matches.length} images...`);
                const insertType = extension_settings[extensionName].insertType;

                // 在当前消息中插入图片
                // 初始化message.extra
                if (!message.extra) {
                    message.extra = {};
                }

                const imageSwipes = ensureImageSwipes(message);

                // 如果已有图片，添加到swipes
                if (
                    message.extra.image &&
                    !imageSwipes.includes(message.extra.image)
                ) {
                    imageSwipes.push(message.extra.image);
                }

                // 获取消息元素用于稍后更新
                const messageElement = $(
                    `.mes[mesid="${context.chat.length - 1}"]`,
                );

                // 处理每个匹配的图片标签
                for (const match of matches) {
                    const prompt =
                        typeof match?.[1] === 'string' ? match[1] : '';
                    if (!prompt.trim()) {
                        continue;
                    }

                    // @ts-ignore
                    const result = await SlashCommandParser.commands[
                        'sd'
                    ].callback(
                        {
                            quiet:
                                insertType === INSERT_TYPE.NEW_MESSAGE
                                    ? 'false'
                                    : 'true',
                        },
                        prompt,
                    );
                    // 统一插入到extra里
                    if (insertType === INSERT_TYPE.INLINE) {
                        let imageUrl = result;
                        if (
                            typeof imageUrl === 'string' &&
                            imageUrl.trim().length > 0
                        ) {
                            const currentImageSwipes = ensureImageSwipes(message);

                            // 添加图片到swipes数组
                            currentImageSwipes.push(imageUrl);

                            // 设置第一张图片为主图片，或更新为最新生成的图片
                            message.extra.image = imageUrl;
                            message.extra.title = prompt;
                            message.extra.inline_image = true;

                            // 更新UI
                            appendMediaToMessage(message, messageElement);

                            // 保存聊天记录
                            await context.saveChat();
                        }
                    } else if (insertType === INSERT_TYPE.REPLACE) {
                        let imageUrl = result;
                        if (
                            typeof imageUrl === 'string' &&
                            imageUrl.trim().length > 0
                        ) {
                            // Find the original image tag in the message
                            const originalTag =
                                typeof match?.[0] === 'string' ? match[0] : '';
                            if (!originalTag) {
                                continue;
                            }
                            // Replace it with an actual image tag
                            const escapedUrl = escapeHtmlAttribute(imageUrl);
                            const escapedPrompt = escapeHtmlAttribute(prompt);
                            const newImageTag = `<img src="${escapedUrl}" title="${escapedPrompt}" alt="${escapedPrompt}" data-pic-gen="${escapedPrompt}">`;
                            message.mes = message.mes.replace(
                                originalTag,
                                newImageTag,
                            );

                            // Update the message display using updateMessageBlock
                            updateMessageBlock(
                                context.chat.length - 1,
                                message,
                            );
                            await eventSource.emit(
                                event_types.MESSAGE_UPDATED,
                                context.chat.length - 1,
                            );

                            // Save the chat
                            await context.saveChat();
                        }
                    }
                }
                toastr.success(
                    `${matches.length} images generated successfully`,
                );
            } catch (error) {
                toastr.error(`Image generation error: ${error}`);
                console.error('Image generation error:', error);
            }
        }, 0); //防阻塞UI渲染
    }
}
