/** 志愿填报报告共享类型（择校报告 / 调剂报告复用同一结构）。 */
export function buildTags(row) {
    var tags = [];
    if (row.is_985)
        tags.push('985');
    if (row.is_211)
        tags.push('211');
    if (row.school_owner === '公办')
        tags.push('公办');
    else if (row.school_owner)
        tags.push(row.school_owner);
    return tags;
}
