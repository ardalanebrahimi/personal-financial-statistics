import { Injectable } from '@angular/core';
import { CategoryService } from './category.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AIService {
  constructor(private categoryService: CategoryService) {}

  async suggestCategory(description: string): Promise<string> {
    const existingCategories = this.categoryService.getCategories();
    const apiKey = environment.openAiApiKey;
    const endpoint = 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = existingCategories.length > 0 
      ? `You are a financial transaction categorizer. Given a transaction description, respond ONLY with a category name.
         If the transaction fits one of these existing categories, use it: ${existingCategories.map(c => c.name).join(', ')}.
         If it doesn't fit any existing category, respond with a new, concise category name (1-3 words maximum).
         DO NOT include any explanations, punctuation, or additional text.`
      : `You are a financial transaction categorizer. Given a transaction description, respond ONLY with a concise category name (1-3 words maximum).
         DO NOT include any explanations, punctuation, or additional text.`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: description
          }
        ],
        max_tokens: 10,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error.message}`);
    }

    const data = await response.json();
    const suggestion = data.choices[0]?.message?.content?.trim();
    
    // If it's a new category, add it to the system
    if (suggestion && !existingCategories.some(c => c.name.toLowerCase() === suggestion.toLowerCase())) {
      this.categoryService.addCategory({
        id: crypto.randomUUID(),
        name: suggestion,
        color: this.generateRandomColor()
      });
    }

    return suggestion;
  }

  private generateRandomColor(): string {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }
}
