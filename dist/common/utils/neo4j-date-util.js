"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatNeo4jDate = formatNeo4jDate;
function formatNeo4jDate(neo4jDate) {
    if (!neo4jDate)
        return null;
    if (typeof neo4jDate === 'string' || typeof neo4jDate === 'number') {
        return neo4jDate;
    }
    if (neo4jDate.year && neo4jDate.month) {
        const date = new Date(neo4jDate.year.low, neo4jDate.month.low - 1, neo4jDate.day.low, neo4jDate.hour.low, neo4jDate.minute.low, neo4jDate.second.low, neo4jDate.nanosecond.low / 1000000);
        return date.toISOString();
    }
    return null;
}
//# sourceMappingURL=neo4j-date-util.js.map