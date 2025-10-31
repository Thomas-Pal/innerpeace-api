export const unauthorized = (res: any) => res.status(401).json({ code: 401, message: 'Unauthorized' });

export const badRequest = (res: any, message = 'Bad Request') =>
  res.status(400).json({ code: 400, message });
