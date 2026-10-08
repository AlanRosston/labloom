export function feedURL(value: string, base?: string): string {
    let url: URL;
    try {
        url = new URL(value, base);
    }
    catch {
        throw new Error("请输入有效的 HTTP 或 HTTPS 地址。");
    }
    if (!value.trim() || !["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error("仅支持不含用户名和密码的 HTTP 或 HTTPS 地址。");
    }
    url.hash = "";
    return url.href;
}

export function arxivURL(categories: string, keyword: string): string {
    const fields = [...new Set(categories.trim().split(/[\s,+]+/).filter(Boolean))];
    if (fields.some(field => !/^[a-z][a-z-]*(\.[A-Za-z]{2})?$/.test(field))) {
        throw new Error("领域格式不正确，例如 cs.AI、cs.LG、stat.ML；多个领域用逗号分隔。");
    }
    const phrase = keyword.trim().replace(/\s+/g, " ");
    if (!fields.length && !phrase) throw new Error("请填写至少一个领域或关键词。");
    if (phrase.length > 200 || /["\\]/.test(phrase)) throw new Error("关键词不能超过 200 字符，或包含双引号、反斜杠。");
    if (!phrase) return `https://rss.arxiv.org/atom/${fields.join("+")}`;

    const query: string[] = [];
    if (fields.length) query.push(`(${fields.map(field => `cat:${field}`).join(" OR ")})`);
    query.push(`(ti:"${phrase}" OR abs:"${phrase}")`);
    const url = new URL("https://export.arxiv.org/api/query");
    url.search = new URLSearchParams({
        search_query: query.join(" AND "),
        sortBy: "submittedDate",
        sortOrder: "descending",
        start: "0",
        max_results: "10"
    }).toString();
    return url.href;
}