// auth/utils/neo4j-date.util.ts
export function formatNeo4jDate(neo4jDate: any): string|number {
    if (!neo4jDate) return null;
    
    // If it's already a string or number, return as-is
    if (typeof neo4jDate === 'string' || typeof neo4jDate === 'number') {
      return neo4jDate;
    }
  
    // Handle Neo4j DateTime object
    if (neo4jDate.year && neo4jDate.month) {
      const date = new Date(
        neo4jDate.year.low,
        neo4jDate.month.low - 1, // Months are 0-indexed in JavaScript
        neo4jDate.day.low,
        neo4jDate.hour.low,
        neo4jDate.minute.low,
        neo4jDate.second.low,
        neo4jDate.nanosecond.low / 1000000
      );
      return date.toISOString();
    }
  
    return null;
  }