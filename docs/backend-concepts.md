# Backend Concepts — E-Commerce Platform

A reference guide covering every core concept used in building the auth feature.
Use this as a study resource before your next session.

---

## 1. NestJS Core Architecture

### Modules
A module is a self-contained unit of your application. Everything in NestJS lives inside a module.

```
AuthModule
  ├── controllers  → handle HTTP requests
  ├── providers    → services, strategies, guards
  ├── imports      → other modules this module needs
  └── exports      → what this module shares with others
```

Key rules:
- A module can only use providers that are declared in its own `providers` array, OR imported from another module via `imports`
- `@Global()` makes a module available everywhere without importing it (used for `PrismaModule`)
- `exports` makes providers available to other modules that import this one

### Controllers
Controllers handle incoming HTTP requests and return responses. They contain no business logic — they delegate to services.

```ts
@Controller('auth')        // base route prefix → /auth
export class AuthController {
  @Post('login')           // → POST /auth/login
  @Get('profile/me')       // → GET /auth/profile/me
}
```

### Services (Providers)
Services contain the business logic. They are injectable — NestJS creates one instance and shares it via dependency injection.

```ts
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}
  // business logic here
}
```

### Dependency Injection (DI)
NestJS manages the creation and sharing of class instances. You declare what you need in the constructor, NestJS provides it.

```ts
// You don't do this:
const authService = new AuthService(new PrismaService(), new JwtService());

// NestJS does it for you:
constructor(private readonly authService: AuthService) {}
```

Why it matters: DI makes your code testable (you can inject mocks) and decoupled (classes don't create their own dependencies).

---

## 2. The Request Lifecycle

Every HTTP request passes through these layers in order:

```
Incoming Request
      ↓
  Middleware          (cookie-parser, cors, etc.)
      ↓
  Guards              (JwtAuthGuard, ThrottlerGuard) → can reject with 401/429
      ↓
  Interceptors        (TransformInterceptor — before handler)
      ↓
  Pipes               (ValidationPipe — validates & transforms DTOs)
      ↓
  Controller Method   (your handler runs here)
      ↓
  Service             (business logic)
      ↓
  Interceptors        (TransformInterceptor — wraps the response)
      ↓
  Exception Filters   (HttpExceptionFilter — catches errors, formats them)
      ↓
Outgoing Response
```

This is why:
- Guards run before your controller (they can block the request)
- Interceptors run both before AND after (they can transform input and output)
- Exception filters run last (they catch errors from anywhere above)

---

## 3. Authentication Concepts

### Passwords — Never Store Plain Text
Passwords must be hashed before storing. Hashing is a one-way operation — you can verify but not reverse it.

```
User enters: "MyPassword123!"
bcrypt hashes it: "$2b$10$K8Z..."   ← stored in DB
```

**bcrypt** adds a "salt" (random data) before hashing, so two identical passwords produce different hashes. This prevents rainbow table attacks.

```ts
await hash(password, 10)           // 10 = salt rounds (higher = slower = more secure)
await compare(plaintext, hash)     // returns true/false
```

### JWT — JSON Web Tokens
A JWT is a self-contained token that carries information (called claims). It has three parts:

```
header.payload.signature
eyJhbGci...  .  eyJzdWIi...  .  SflKxwR...
```

- **Header**: algorithm used (HS256)
- **Payload**: data you put in (`{ sub, email, role }`)
- **Signature**: proves the token wasn't tampered with (signed with your secret)

Anyone can decode the payload — it's just Base64 encoded, not encrypted. The signature is what makes it trustworthy. Never put sensitive data (passwords, card numbers) in a JWT.

```ts
// Signing a token
jwtService.signAsync({ sub: userId, email, role }, { expiresIn: '1h' })

// Verifying a token
jwtService.verifyAsync(token, { secret: JWT_SECRET })
// → throws if invalid or expired
// → returns decoded payload if valid
```

### Access Token vs Refresh Token

| | Access Token | Refresh Token |
|---|---|---|
| TTL | 15min–1h | 7–30 days |
| Stored | Memory (JS variable) | httpOnly cookie |
| Sent with | Every API request (Authorization header) | Only to /auth/refresh |
| Contains | userId, email, role | Only userId |
| If stolen | Attacker has 1h access | Attacker can keep getting new access tokens |

**Why two tokens?**
- Short-lived access tokens limit damage if stolen
- Long-lived refresh tokens avoid constant re-login
- The refresh token is never exposed to JavaScript (httpOnly cookie) so XSS attacks can't steal it

### Token Rotation
Every time you use a refresh token, it is deleted and replaced with a new one.

```
Client sends refresh token → Server verifies → Deletes old token → Issues new pair
```

Why: if someone steals a refresh token and uses it, the legitimate user's next refresh will fail (token already used/deleted), alerting you to a breach.

### httpOnly Cookies vs localStorage

| | localStorage | httpOnly Cookie |
|---|---|---|
| Accessible by JS | Yes | No |
| XSS vulnerable | Yes | No |
| CSRF vulnerable | No | Yes (mitigated with sameSite) |

Access tokens go in memory (a JS variable or state management store).
Refresh tokens go in httpOnly cookies.
Never store tokens in localStorage.

---

## 4. Passport.js & JWT Strategy

Passport is an authentication middleware. In NestJS it integrates via strategies.

### How JwtStrategy works

```ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: JWT_SECRET,
    });
  }

  validate(payload: any) {
    // Called AFTER Passport verifies the token
    // payload is already decoded and trusted
    return { userId: payload.sub, email: payload.email, role: payload.role };
    // return value is attached to request.user
  }
}
```

Flow:
1. Request comes in with `Authorization: Bearer <token>`
2. Passport extracts the token
3. Passport verifies signature + expiry using `secretOrKey`
4. If valid → calls `validate()` with decoded payload
5. Return value of `validate()` → attached to `request.user`
6. If invalid → 401 automatically

---

## 5. Guards

Guards decide whether a request should proceed. They run before the controller.

```ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);  // delegates to JwtStrategy
  }
}
```

`canActivate` returns:
- `true` → request proceeds
- `false` → 403 Forbidden
- throws an exception → that exception is returned

### Global Guards via APP_GUARD
```ts
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: ThrottlerGuard },
]
```

Using `APP_GUARD` instead of `app.useGlobalGuards()` keeps the guard inside the DI container, allowing it to inject services like `Reflector`.

---

## 6. Interceptors

Interceptors wrap the request/response cycle. They run before AND after the controller handler.

```ts
intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
  // BEFORE: runs before controller
  console.log('Before...');

  return next.handle().pipe(
    map(data => {
      // AFTER: transforms the response
      return { data, success: true, message: '...' };
    })
  );
}
```

Used for: response transformation, logging, caching, timing.

### Reflector
`Reflector` reads metadata set by decorators.

```ts
// Decorator sets metadata:
@ResponseMessage('User registered successfully')
// → SetMetadata('response_message', 'User registered successfully')

// Interceptor reads it:
const message = this.reflector.get('response_message', context.getHandler());
```

`getAllAndOverride` checks method-level metadata first, falls back to class-level.

---

## 7. Exception Filters

Filters catch exceptions thrown anywhere in the request pipeline and format the error response.

```ts
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    response.status(exception.getStatus()).json({
      statusCode: exception.getStatus(),
      message: exception.message,
      success: false,
    });
  }
}
```

Without a filter, NestJS returns its own default error format. With a filter, you control the exact shape of every error response.

---

## 8. Custom Decorators

### Parameter Decorators (`createParamDecorator`)
Extract data from the request and inject it into controller parameters.

```ts
export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: UserPayload }>();
    return data ? request.user[data] : request.user;
  }
);

// Usage:
async logout(@CurrentUser('userId') userId: string) {}
async me(@CurrentUser() user: UserPayload) {}
```

### Metadata Decorators (`SetMetadata`)
Attach metadata to a route that guards/interceptors can read via `Reflector`.

```ts
export const Public = () => SetMetadata('isPublic', true);
export const ResponseMessage = (msg: string) => SetMetadata('response_message', msg);
```

---

## 9. DTOs and Validation

DTO (Data Transfer Object) defines the shape of incoming request data.

```ts
export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  @Matches(/^(?=.*\d)(?=.*[!@#$%^&*])/)
  password: string;
}
```

`ValidationPipe` with `whitelist: true`:
- Validates against the DTO
- Strips any extra fields not in the DTO (whitelist)
- Returns 400 with error messages if validation fails

---

## 10. Prisma ORM

Prisma is a type-safe database client. It generates TypeScript types from your schema.

```ts
// Query with relation
const user = await prisma.user.findUnique({
  where: { id: userId },
  include: { refresh_tokens: true },  // JOIN
  omit: { password_hash: true },      // exclude field
});

// Create
await prisma.refreshToken.create({
  data: { user_id, token_hash, expires_at }
});

// Delete matching records
await prisma.refreshToken.deleteMany({
  where: { user_id: userId }
});
```

### Why `omit` instead of casting
```ts
// Wrong — password_hash is still in the object, TypeScript just doesn't see it:
return user as Omit<User, 'password_hash'>;

// Correct — Prisma actually removes the field before returning:
const user = await prisma.user.findUnique({
  omit: { password_hash: true }
});
```

---

## 11. Security Patterns Applied

### User Enumeration Prevention
Always return the same error regardless of whether the email exists or the password is wrong:
```ts
// Never do this:
if (!user) throw new Error('Email not found');         // reveals valid emails
if (!valid) throw new Error('Wrong password');         // reveals valid emails

// Always do this:
throw new HttpException('Invalid credentials', 401);   // reveals nothing
```

### Rate Limiting
Limits how many requests a client can make in a time window. Prevents brute force attacks.

```ts
@Throttle({ short: { ttl: 300_000, limit: 10 } })  // 10 attempts per 5 minutes
```

Returns HTTP 429 Too Many Requests when exceeded.

### Never Store Raw Tokens
Always hash refresh tokens before storing:
```ts
// Store this in DB:
const token_hash = await hash(refresh_token, 10);

// To verify:
await compare(incoming_token, stored_hash);  // bcrypt compare
```

If your DB is breached, raw tokens would let attackers impersonate users immediately. Hashed tokens are useless without the originals.

---

## 12. Environment Variables

Never hardcode secrets. Use environment variables:

```
JWT_SECRET=...
JWT_EXPIRES_IN=1h
DATABASE_URL=...
```

NestJS `ConfigModule` loads `.env` and makes values available via `ConfigService`:
```ts
configService.get('JWT_SECRET')        // returns string | undefined
configService.getOrThrow('JWT_SECRET') // returns string or throws at startup
```

`getOrThrow` is preferred for required variables — fail fast at startup rather than failing later at runtime.

---

## 13. Cookie Configuration

```ts
response.cookie('refresh_token', token, {
  httpOnly: true,   // not accessible by JavaScript → prevents XSS theft
  secure: true,     // only sent over HTTPS → prevents interception
  sameSite: 'strict', // only sent to same origin → prevents CSRF
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
});
```

`cookie-parser` middleware must be registered in `main.ts` for `request.cookies` to work.

---

## Summary — What You Built

```
POST /auth/register     → create user, hash password, issue JWT pair
POST /auth/login        → verify credentials, issue JWT pair
POST /auth/logout       → delete refresh tokens from DB, clear cookie
POST /auth/refresh      → verify refresh token, rotate it, issue new access token
GET  /auth/profile/me   → return current user from DB (no password_hash)
```

Security layer:
- Passwords hashed with bcrypt (10 salt rounds)
- Refresh tokens hashed before DB storage
- Access tokens: 1h TTL, in memory
- Refresh tokens: 7d TTL, httpOnly cookie, rotated on every use
- Global JWT guard with @Public() escape hatch
- Rate limiting: 10 auth attempts per 5 minutes
- Generic error messages (no user enumeration)
- Standardized API responses via interceptor + filter
