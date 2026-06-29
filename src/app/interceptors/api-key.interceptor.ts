import { HttpInterceptorFn, HttpHeaders } from '@angular/common/http';

export const apiKeyInterceptor: HttpInterceptorFn = (req, next) => {
  const apiKey = localStorage.getItem('JULES_API_KEY') || '';

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
