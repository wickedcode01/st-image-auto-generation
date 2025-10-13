
// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext } from "../../../extensions.js";
//You'll likely need to import some other functions from the main script
import { saveSettingsDebounced, eventSource, event_types, updateMessageBlock } from "../../../../script.js";
import { appendMediaToMessage } from "../../../../script.js";
import { regexFromString } from '../../../utils.js';
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

// 扩展名称和路径
const extensionName = "st-image-auto-generation";
// /scripts/extensions/third-party
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

// 插入类型常量
const INSERT_TYPE = {
    DISABLED: 'disabled',
    INLINE: 'inline',
    NEW_MESSAGE: 'new',
    REPLACE: 'replace'
};

// 默认设置
const defaultSettings = {
    insertType: INSERT_TYPE.DISABLED,
    promptInjection: {
        enabled: true,
        prompt:
            `<image_generation>
You must insert a <pic prompt="example prompt"> at end of the reply. Prompts are used for stable diffusion image generation, based on the plot and character to output appropriate prompts to generate captivating images.
</image_generation>`,
        regex: '/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g',
        position: 'deep_system', // deep_system, deep_user, deep_assistant
        depth: 0 // 0表示添加到末尾，>0表示从末尾往前数第几个位置
    }
};

// 从设置更新UI
function updateUI() {
    // 根据insertType设置开关状态
    $("#auto_generation").toggleClass('selected', extension_settings[extensionName].insertType !== INSERT_TYPE.DISABLED);

    // 只在表单元素存在时更新它们
    if ($("#image_generation_insert_type").length) {
        $('#image_generation_insert_type').val(extension_settings[extensionName].insertType);
        $('#prompt_injection_enabled').prop('checked', extension_settings[extensionName].promptInjection.enabled);
        $('#prompt_injection_text').val(extension_settings[extensionName].promptInjection.prompt);
        $('#prompt_injection_regex').val(extension_settings[extensionName].promptInjection.regex);
        $('#prompt_injection_position').val(extension_settings[extensionName].promptInjection.position);
        $('#prompt_injection_depth').val(extension_settings[extensionName].promptInjection.depth);
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
            extension_settings[extensionName].promptInjection = defaultSettings.promptInjection;
        } else {
            // 确保promptInjection的所有子属性都存在
            const defaultPromptInjection = defaultSettings.promptInjection;
            for (const key in defaultPromptInjection) {
                if (extension_settings[extensionName].promptInjection[key] === undefined) {
                    extension_settings[extensionName].promptInjection[key] = defaultPromptInjection[key];
                }
            }
        }

        // 确保insertType属性存在
        if (extension_settings[extensionName].insertType === undefined) {
            extension_settings[extensionName].insertType = defaultSettings.insertType;
        }
    }

    updateUI();
}

// 创建设置页面
async function createSettings(settingsHtml) {
    // 创建一个容器来存放设置，确保其正确显示在扩展设置面板中
    if (!$("#image_auto_generation_container").length) {
        $("#extensions_settings2").append('<div id="image_auto_generation_container" class="extension_container"></div>');
    }

    // 使用传入的settingsHtml而不是重新获取
    $("#image_auto_generation_container").empty().append(settingsHtml);

    // 添加设置变更事件处理
    $('#image_generation_insert_type').on('change', function () {
        const newValue = $(this).val();
        extension_settings[extensionName].insertType = newValue;
        updateUI();
        saveSettingsDebounced();
    });

    // 添加提示词注入设置的事件处理
    $('#prompt_injection_enabled').on('change', function () {
        extension_settings[extensionName].promptInjection.enabled = $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#prompt_injection_text').on('input', function () {
        extension_settings[extensionName].promptInjection.prompt = $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_regex').on('input', function () {
        extension_settings[extensionName].promptInjection.regex = $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_position').on('change', function () {
        extension_settings[extensionName].promptInjection.position = $(this).val();
        saveSettingsDebounced();
    });

    // 深度设置事件处理
    $('#prompt_injection_depth').on('input', function () {
        const value = parseInt(String($(this).val()));
        extension_settings[extensionName].promptInjection.depth = isNaN(value) ? 0 : value;
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
            $('#rm_extensions_block').animate({
                scrollTop: container.offset().top - $('#rm_extensions_block').offset().top + $('#rm_extensions_block').scrollTop()
            }, 500);

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
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // 添加扩展到菜单
        $("#extensionsMenu").append(`<div id="auto_generation" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-robot"></div>
            <span data-i18n="Image Auto Generation">Image Auto Generation</span>
        </div>`);

        // 修改点击事件，打开设置面板而不是切换状态
        $("#auto_generation").off('click').on("click", onExtensionButtonClick);

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
    if (!extension_settings[extensionName] ||
        !extension_settings[extensionName].promptInjection ||
        !extension_settings[extensionName].promptInjection.position) {
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

/**
 * 根据名称查找全局正则脚本的ID
 * @param {string} scriptName - 要查找的正则脚本名称
 * @returns {string|null} 匹配的全局正则ID，未找到则返回null
 */
function findGlobalRegexIdByName(scriptName) {
    // 处理输入名称（统一小写+去空格，避免匹配差异）
    const targetName = scriptName.toLowerCase().trim();

    // 校验全局正则数组是否存在
    if (!Array.isArray(extension_settings.regex)) {
        console.warn('全局正则脚本数组不存在');
        return null;
    }

    // 遍历全局正则数组，匹配名称
    const matchedScript = extension_settings.regex.find(script => {
        // 脚本名称可能为undefined，需先判断
        if (typeof script.scriptName !== 'string') return false;
        // 统一处理脚本名称后比较
        return script.scriptName.toLowerCase().trim() === targetName;
    });

    // 返回找到的ID或null
    return matchedScript ? matchedScript.id : null;
}
function simulateRegexToggle(regexId) {
    // 延迟执行，确保DOM已渲染（SillyTavern消息渲染可能有延迟）
    setTimeout(() => {
        // 直接通过ID定位正则容器（基于用户提供的DOM结构）
        const scriptContainer = document.getElementById(regexId);
        if (!scriptContainer) {
                          //  alert(`[${extensionName}] 未找到ID为${regexId}的正则脚本容器`)

            console.warn(`[${extensionName}] 未找到ID为${regexId}的正则脚本容器`);
            return;
        }

        // 验证容器类型
        if (!scriptContainer.classList.contains('regex-script-label')) {
            console.warn(`[${extensionName}] ID为${regexId}的元素不是正则脚本容器`);
            //alert(`[${extensionName}] ID为${regexId}的元素不是正则脚本容器`);
            return;
        }

        // 查找开关按钮（基于用户提供的class="disable_regex"）
        const toggleCheckbox = scriptContainer.querySelector('.disable_regex');
        if (!toggleCheckbox) {
            console.warn(`[${extensionName}] 未找到ID为${regexId}的正则开关`);
            //alert(`[${extensionName}] 未找到ID为${regexId}的正则开关`);
            return;
        }

        // 触发点击事件
        toggleCheckbox.click();
        console.log(`[${extensionName}] 已模拟点击正则脚本${regexId}的开关`);

        // alert(`[${extensionName}] 已模拟点击正则脚本${regexId}的开关`);
        toastr.success(`[${extensionName}] 已模拟点击正则脚本${regexId}的开关`);

    }, 200); // 100ms延迟确保DOM就绪
}



// 监听CHAT_COMPLETION_PROMPT_READY事件以注入提示词
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async function (eventData) {
    try {
        // 确保设置对象和promptInjection对象都存在
        if (!extension_settings[extensionName] ||
            !extension_settings[extensionName].promptInjection ||
            !extension_settings[extensionName].promptInjection.enabled ||
            extension_settings[extensionName].insertType === INSERT_TYPE.DISABLED) {
            return;
        }

        const prompt = extension_settings[extensionName].promptInjection.prompt;
        const depth = extension_settings[extensionName].promptInjection.depth || 0;
        const role = getMesRole();

        console.log(`[${extensionName}] 准备注入提示词: 角色=${role}, 深度=${depth}`);
        console.log(`[${extensionName}] 提示词内容: ${prompt.substring(0, 50)}...`);

        // 根据depth参数决定插入位置
        if (depth === 0) {
            // 添加到末尾
            eventData.chat.push({ role: role, content: prompt });
            console.log(`[${extensionName}] 提示词已添加到聊天末尾`);
        } else {
            // 从末尾向前插入
            eventData.chat.splice(-depth, 0, { role: role, content: prompt });
            console.log(`[${extensionName}] 提示词已插入到聊天中，从末尾往前第 ${depth} 个位置`);
        }

    } catch (error) {
        console.error(`[${extensionName}] 提示词注入错误:`, error);
        toastr.error(`提示词注入错误: ${error}`);
    }
});
// 监听消息接收事件
eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
async function handleIncomingMessage() {
    // 确保设置对象存在
    if (!extension_settings[extensionName] ||
        extension_settings[extensionName].insertType === INSERT_TYPE.DISABLED) {
        return;
    }

    const context = getContext();
    const message = context.chat[context.chat.length - 1];

    // 检查是否是AI消息
    if (!message || message.is_user) {
        return;
    }

    // 确保promptInjection对象和regex属性存在
    if (!extension_settings[extensionName].promptInjection ||
        !extension_settings[extensionName].promptInjection.regex) {
        console.error('Prompt injection settings not properly initialized');
        return;
    }

    // 使用正则表达式search，获取完整匹配对象（含完整标签+捕获组）
    const imgTagRegex = regexFromString(extension_settings[extensionName].promptInjection.regex);
    // 核心修改：删除.map(match => match[1])，保留完整匹配信息，无需后续重复match
    let matches = imgTagRegex.global ? [...message.mes.matchAll(imgTagRegex)] : [message.mes.match(imgTagRegex)]; 
    console.log(imgTagRegex, matches)

    if(matches.length === 0){
    
    }
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

                // 初始化image_swipes数组
                if (!Array.isArray(message.extra.image_swipes)) {
                    message.extra.image_swipes = [];
                }

                // 如果已有图片，添加到swipes
                if (message.extra.image && !message.extra.image_swipes.includes(message.extra.image)) {
                    message.extra.image_swipes.push(message.extra.image);
                }

                // 获取消息元素用于稍后更新
                const messageElement = $(`.mes[mesid="${context.chat.length - 1}"]`);

                // 处理每个匹配的图片标签：直接从预存的matches中取数据，无重复match
                for (let i = 0; i < matches.length; i++) {
                    // 核心修改：从完整匹配对象中直接提取，无需再调用message.mes.match()
                    const prompt = matches[i][1]; // 匹配对象的[1]为捕获组内容（即图片prompt）
                    const originalTag = matches[i][0]; // 匹配对象的[0]为完整匹配标签（用于后续替换）

                    // @ts-ignore
                    const result = await SlashCommandParser.commands['sd'].callback({ quiet: insertType === INSERT_TYPE.NEW_MESSAGE ? 'false' : 'true' }, prompt);
                    // 统一插入到extra里
                    if (insertType === INSERT_TYPE.INLINE) {
                        let imageUrl = result;
                        if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
                            // 添加图片到swipes数组
                            message.extra.image_swipes.push(imageUrl);

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
                        if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
                            // 直接使用预存的originalTag，无需重复匹配原标签
                            const newImageTag = `<img src="${imageUrl}" prompt="${prompt}" >`;
                            message.mes = message.mes.replace(originalTag, newImageTag);

                            // Update the message display using updateMessageBlock
                            updateMessageBlock(context.chat.length - 1, message);

                            // Save the chat
                            await context.saveChat();
                        }
                    }

                }

                // 1. 先通过正则名称查找ID（这里假设要操作的正则名称是"状态栏美化"，可根据实际修改）
                const targetRegexName = "状态栏美化"; // 替换为你的正则脚本名称
                const targetRegexId = findGlobalRegexIdByName(targetRegexName);

                if (targetRegexId) {
                    // 2. 模拟点击开关（切换状态）
                    simulateRegexToggle(targetRegexId);
                } else {
                    alert(`[${extensionName}] 未找到名称为"${targetRegexName}"的全局正则脚本`);
                }

                toastr.success(`${matches.length} images generated successfully`);
            } catch (error) {
                toastr.error(`Image generation error: ${error}`);
                console.error('Image generation error:', error);
            }
        }, 0); //防阻塞UI渲染
    }
}




