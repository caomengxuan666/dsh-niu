window.__ModuleLoader__.load({
  id: "@cmx666/dsh-client-ui-niu",
  factory: (require) => {
    const module = { exports: {} };
    const React = require("react");
    const h = React.createElement;
    const NS = "settings.niu";

    const copy = {
      en: {
        title: "Niubash (niu)",
        description: "Use Niubash for DSH shell execution on Windows.",
        enabled: "Enabled",
        enabledHint: "Niubash is selected for the next DSH startup.",
        disabledHint: "PowerShell remains selected until Niubash is enabled.",
        restart: "Restart DSH to apply this change.",
        detected: "Provider installed",
        exportSession: "Export session",
      },
      zh: {
        title: "Niubash (niu)",
        description: "在 Windows 上使用 Niubash 执行 DSH Shell 命令。",
        enabled: "启用 Niubash",
        enabledHint: "下一次启动 DSH 时将选择 Niubash。",
        disabledHint: "启用 Niubash 后才会切换 Shell。",
        restart: "重启 DSH 后生效。",
        detected: "Provider 已安装",
        exportSession: "导出会话",
      },
    };

    function language() {
      return (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
    }

    function NiuCard() {
      const lang = language();
      const t = copy[lang];
      const [enabled, setEnabled] = React.useState(() => {
        try { return localStorage.getItem("dsh.niu.enabled") !== "0"; } catch { return true; }
      });
      const update = (event) => {
        const next = event.currentTarget.checked;
        setEnabled(next);
        try { localStorage.setItem("dsh.niu.enabled", next ? "1" : "0"); } catch {}
      };
      return h("article", {
        style: {
          border: "1px solid var(--dsw-alias-border-l2)",
          background: "var(--dsw-alias-bg-layer-3)",
          borderRadius: 10,
          padding: "16px",
          display: "grid",
          gap: 12,
        },
      },
        h("div", { style: { display: "grid", gap: 4 } },
          h("strong", { style: { color: "var(--dsw-alias-label-primary)", fontSize: 15 } }, t.title),
          h("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 13 } }, t.description),
        ),
        h("label", { style: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" } },
          h("input", { type: "checkbox", checked: enabled, onChange: update }),
          h("span", { style: { color: "var(--dsw-alias-label-primary)", fontSize: 13 } }, t.enabled),
        ),
        h("div", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: 1.5 } },
          h("div", null, enabled ? t.enabledHint : t.disabledHint),
          h("div", null, t.restart),
          h("div", null, t.detected),
        ),
      );
    }

    function EmptyExportUtility() {
      return null;
    }

    function SessionExportAction({ sessionId, request }) {
      const lang = language();
      return h("button", {
        type: "button",
        onClick: () => request(sessionId),
        style: {
          border: "1px solid var(--dsw-alias-border-l2)",
          background: "transparent",
          color: "var(--dsw-alias-label-primary)",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: "pointer",
          font: "inherit",
          fontSize: 13,
        },
      }, copy[lang].exportSession);
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, copy), "ui-niu: dictionaries");
      ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
        key: "niu",
        name: "settings.plugin.item",
        id: "niu",
        order: -10,
        locale: NS,
      }, NiuCard));
      ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
        name: "conversation.session.header.utilities",
        id: "niu-session-log-download",
        order: 0,
      }, EmptyExportUtility));
      ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
        name: "conversation.session.header.actions",
        id: "niu-session-log-download-action",
        order: 100,
        locale: NS,
        inject: () => ({
          request: (sessionId) => ctx.remote.commands.execute(sessionId, "/export"),
        }),
      }, SessionExportAction));
    }

    module.exports = { NS, apply, inject: ["slots", "locale", "remote"] };
    return module.exports;
  },
});
