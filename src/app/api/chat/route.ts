import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ 
        success: false, 
        error: '消息不能为空' 
      }, { status: 400 });
    }

    // 初始化 AI SDK
    const zai = await ZAI.create();

    // 调用智谱AI
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: '你是 Rui Hub 的 AI 助手，名叫 GLM。你是一个友好、专业的助手，可以帮助用户回答各种问题。请用简洁、清晰的方式回答问题。'
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const response = completion.choices?.[0]?.message?.content || '抱歉，我无法生成回复。';

    return NextResponse.json({ 
      success: true, 
      response 
    });

  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'AI 服务暂时不可用' 
    }, { status: 500 });
  }
}
