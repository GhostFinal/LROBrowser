# 怪物静态参考资料

`src/assistant/lro-monster-reference.mjs` 仅包含怪物编号对应的属性、属性等级、体型、种族与等级。不含血量；不能作为本服实时数值。

来源：[rAthena renewal mob_db.yml](https://github.com/rathena/rathena/blob/e985006171d2eb320ee512a653f4c83aea3d81b6/db/re/mob_db.yml)，固定提交 `e985006171d2eb320ee512a653f4c83aea3d81b6`。上游版权声明 Copyright (c) 2024 rAthena Development Team，许可 GPL-3.0-or-later；完整许可保存在 [rathena-GPL-3.0.txt](rathena-GPL-3.0.txt)。原始可编辑数据可从上述固定链接取得。该参考数据保留同一许可。

转换规则：按顶层怪物 `Id` 读取 `Element/ElementLevel/Size/Race/Level`；未声明时采用上游文件头定义的 Neutral/1/Small/Formless/1。枚举按原生客户端顺序映射为整数；不支持的玩家种族枚举不纳入。共有 2673 条。输入为上述固定版本的 `mob_db.yml`，转换后的静态数组在 `src/assistant/lro-monster-reference.mjs`；运行无需本机外部文件。

界面用 `*` 标记来自参考库的字段，并在悬停文字说明自定义服务器可能不同。已收到的实体属性优先。图片复用当前客户端已加载的怪物 SPR，不来自此数据表，不新增外部资源来源；运行时不会请求 rAthena。
