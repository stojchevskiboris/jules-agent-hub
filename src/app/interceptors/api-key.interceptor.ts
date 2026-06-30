import { HttpInterceptorFn, HttpHeaders } from '@angular/common/http';

export const apiKeyInterceptor: HttpInterceptorFn = (req, next) => {
  let apiKey = '';
  try {
    apiKey = localStorage.getItem('JULES_API_KEY') || '';
  } catch (e) {
    console.error('Failed to access localStorage', e);
  }

  if (apiKey) {
    const authReq = req.clone({
      headers: new HttpHeaders({
        'X-Goog-Api-Key': apiKey
      })
    });
    return next(authReq);
  }

  return next(req);
};
