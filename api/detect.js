export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: '仅支持 POST 请求' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { text, type = 'ai' } = await req.json();

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: '请提供要检测的文本内容' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 获取 API Key (需要在 Vercel 环境变量中配置)
    const apiKey = process.env.DETECTION_API_KEY;
    
    if (!apiKey) {
      // 如果没有配置 API Key，返回模拟数据用于测试
      console.warn('未配置 DETECTION_API_KEY，返回模拟数据');
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            ai_probability: Math.random() * 0.3 + 0.3, // 30%-60%
            risk_level: Math.random() > 0.5 ? 'medium' : 'low',
            keywords: ['AI生成', '机器写作'],
            suggestions: ['建议增加个人观点', '优化语言表达'],
            is_ai_generated: Math.random() > 0.5
          },
          message: '演示模式：未配置真实 API'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 根据类型调用不同的检测服务
    let result;
    
    if (type === 'ai') {
      // AI 内容检测 - 以 GPTZero API 为例
      result = await detectAIContent(text, apiKey);
    } else if (type === 'sensitive') {
      // 敏感内容检测 - 以阿里云内容安全为例
      result = await detectSensitiveContent(text, apiKey);
    } else {
      return new Response(
        JSON.stringify({ error: '不支持的检测类型' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('检测错误:', error);
    return new Response(
      JSON.stringify({ 
        error: '检测失败',
        message: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// AI 内容检测函数 (以 GPTZero 为例)
async function detectAIContent(text, apiKey) {
  // 注意：不同 API 服务商的接口不同，需要调整
  // 这里以 GPTZero API 为例: https://gptzero.me/
  
  const response = await fetch('https://api.gptzero.me/v2/predict/text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify({
      text: text
    })
  });

  if (!response.ok) {
    throw new Error(`GPTZero API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  
  // 根据实际 API 返回格式解析结果
  // 以下是示例解析逻辑，需要根据实际 API 文档调整
  return {
    success: true,
    data: {
      ai_probability: data.result?.documents?.[0]?.avg_perplexity || 0,
      risk_level: getRiskLevel(data.result?.documents?.[0]?.avg_perplexity),
      keywords: extractKeywords(text),
      suggestions: generateSuggestions(data),
      is_ai_generated: data.result?.documents?.[0]?.is_ai_generated || false,
      raw_response: data // 保留原始响应便于调试
    }
  };
}

// 敏感内容检测函数 (以阿里云内容安全为例)
async function detectSensitiveContent(text, apiKey) {
  // 阿里云内容安全 API 示例
  const response = await fetch('https://green.cn-beijing.aliyuncs.com/green/text/scankin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      scenes: ['antispam'],
      tasks: [{
        content: text,
        dataId: 'task_' + Date.now()
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`阿里云 API 请求失败: ${response.status}`);
  }

  const data = await response.json();
  
  return {
    success: true,
    data: {
      is_sensitive: data.data?.[0]?.results?.[0]?.suggestion === 'block',
      risk_level: data.data?.[0]?.results?.[0]?.suggestion || 'pass',
      categories: extractCategories(data),
      raw_response: data
    }
  };
}

// 辅助函数：根据分数判断风险等级
function getRiskLevel(score) {
  if (!score) return 'unknown';
  if (score > 70) return 'high';
  if (score > 40) return 'medium';
  return 'low';
}

// 辅助函数：提取关键词 (简化版)
function extractKeywords(text) {
  // 实际应用中可以使用更复杂的 NLP 库
  const commonWords = ['AI', '生成', '模型', '算法', '数据'];
  return commonWords.filter(word => text.includes(word));
}

// 辅助函数：生成建议
function generateSuggestions(data) {
  const suggestions = [];
  if (data.result?.documents?.[0]?.is_ai_generated) {
    suggestions.push('建议增加个人观点和原创内容');
    suggestions.push('优化语言表达，使其更自然');
  }
  if (suggestions.length === 0) {
    suggestions.push('内容质量良好，继续保持');
  }
  return suggestions;
}

// 辅助函数：提取敏感类别
function extractCategories(data) {
  // 根据实际 API 返回解析
  return ['spam', 'advertising'].filter(cat => 
    data.data?.[0]?.results?.[0]?.details?.some(d => d.label === cat)
  );
}
