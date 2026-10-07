import { z } from 'zod';
import { evaluate } from 'mathjs';
import { Tool } from './index';

const schema = z.object({
  expression: z.string().min(1, 'La expresión no puede estar vacía.'),
});

const FORBIDDEN = /[a-zA-Z]/;

export const calculator: Tool<typeof schema> = {
  name: 'calculator',
  description: 'Evalúa una expresión matemática (ej: "15% de 340000" → "0.15 * 340000", "sqrt(2)"). Nunca usa eval. Soporta +,-,*,/,%,paréntesis y funciones de mathjs.',
  schema,
  dangerous: false,
  dangerReason: () => null,
  handler: ({ expression }) => {
    if (FORBIDDEN.test(expression) && !/^(sqrt|abs|round|floor|ceil|sin|cos|tan|log|ln|exp|pow)\b/.test(expression.trim())) {
      return 'Expresión inválida: no se permiten nombres de variable. Escribí la operación numérica (ej: "0.15 * 340000").';
    }
    try {
      const result = evaluate(expression);
      const value = typeof result === 'number' ? result : Number(result);
      if (Number.isNaN(value)) {
        return 'No se pudo calcular (resultado no numérico).';
      }
      return String(value);
    } catch (err: any) {
      return `Error al calcular: ${err?.message || String(err)}`;
    }
  },
};
