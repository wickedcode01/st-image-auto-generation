# 酒馆图像自动生成插件

[EN](./README_EN.md)

### 更新

#### 1.0.5

- 修复“插入当前消息”模式下，一条回复里包含多个 `<pic prompt="...">` 标签时，后续图片可能无法继续追加的问题。
- 如果你是从旧版本更新，建议在 SillyTavern 的扩展管理里执行更新后刷新页面，确保新版脚本已加载。

#### 1.0.4

行内替换模式兼容性不是很好，经常会给格式顶掉，尝试修复了一下，但是我手头不太好复现这个bug。暂时就先这样...

### 描述

当检测到AI消息中的 `<pic prompt="...">` 标签时，此扩展会自动生成图像。它与SillyTavern的图像生成功能无缝集成，允许您的AI角色在回复中包含图像。

**请确保你酒馆自带的生图功能能够使用**

**默认会在消息列表的最后注入相关生图提示词，可以在设置里更改**

### 功能

- 自动检测并处理AI消息中的图像生成请求
- 三种插入模式：
  - 插入当前消息（会插入酒馆自带的extra数组中，支持图片控件功能）
  - 行内替换模式（会直接替换相应的标签，不支持图片控件功能）
  - 创建新消息（酒馆默认的生图方法，会直接创建一条新的消息显示图片，兼容性最好）
- 扩展菜单中简单的开关
- 扩展设置面板中的配置选项
- 自定义提示词模板和正则

### 推荐设置

如果你只想要一次生成一张图，那用默认的prompt就行了，也可以在最后增加一些生图指导，让LLM更加了解如何写好prompt。

如果你想要一次生成多张图，可以用以下的提示和正则(仅供参考)：

```
prompt: <image_generation>You must insert at most three <pic prompt="example prompt"> in the reply. Prompts are used for stable diffusion image generation, based on the plot and character to output appropriate prompts to generate captivating images.</image_generation>
regexp: /<pic[^>]*\sprompt="([^"]*)"[^>]*?>/g
```

### 常见问题

**NovelAI的key怎么设置？**

- 需要在设置聊天补全的那个地方设置，下拉就可以看到NovelAI的选项了。

**需要世界书吗？**

- 不需要，插件内置了prompt，可以自定义，也可以将之前世界书的生图指导复制进去。

**为什么无法自动生图？**

- 检查一下正则表达式，确定正则表达式能够匹配到AI返回的标签。麻烦查看下正则是不是`<pic[^>]*\sprompt="([^"]*)"[^>]*?>`，错误的正则可能少了一个斜杠变成`<pic[^>]*sprompt="([^"]*)"[^>]*?>`。如果你修改了提示模板的话，需要将正则改成对应上你提示模板里要求的标签。

### 前置

拓展 -> 图像生成 -> 配置好API<br>

### 安装

拓展 -> 安装拓展 -> 输入 https://github.com/wickedcode01/st-image-auto-generation

### 使用方法

1. 点击扩展菜单中的"自动生成图片"启用扩展
2. 在扩展设置面板中配置图像插入类型
3. 当您的AI在消息中包含 `<pic prompt="...">` 时，扩展将自动生成图像
4. 【可选】根据选择的生图模型，在提示词模板内提供一些好的例子，让AI参考。

示例：

```
<pic prompt="score_9, score_8_up, score_7_up, source_anime,
 1girl, woman, kitsune girl, golden bands, blushing, heart, cowboy shot, beautiful face, thick eyelashes, glowing white eyes, fox ears, long flowy silver hair, cute smile, dark eyeshadow, glowing shoulders tattoos, glowing tattoos, floral decoration in hair, night time, shinning moon, blush, white floral kimono, large breasts, cleavage,japanese theme,">
```

### 注意事项

- 提示词注入和正则可以解耦，你完全可以用世界书或其他插件实现更高级的提示词注入（如基于上下文扫描的条件注入）
- 正则的写法必须满足将提示词作为第一个捕获组，即用括号包裹，例如：`<pic[^>]*\sprompt="([^"]*)"[^>]*?>`
- 检查你的正则和提示词是否能够匹配上，如果匹配不上是无法触发自动生图的。

### 截图

![](./dist/Screenshot%202025-05-25%20151108.png)
![](./dist/Screenshot%202025-05-25%20144831.png)
你可以自定义提示词模板和正则表达式<br>
![settings](./dist/screenshot2.png)

请确保在开始前配置好相关的生图模型<br>
![](./dist/Screenshot%202025-05-23%20141239.png)
