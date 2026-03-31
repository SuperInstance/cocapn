# Math Reference — Core Formulas and Concepts

A quick-reference guide for common mathematical concepts, formulas, and relationships. Use this as a lookup when studying or building flashcards.

## Algebra

### Linear Equations
- Slope-intercept form: `y = mx + b` (m = slope, b = y-intercept)
- Point-slope form: `y - y1 = m(x - x1)`
- Standard form: `Ax + By = C`
- Slope formula: `m = (y2 - y1) / (x2 - x1)`
- Distance formula: `d = sqrt((x2-x1)^2 + (y2-y1)^2)`
- Midpoint formula: `M = ((x1+x2)/2, (y1+y2)/2)`

### Quadratic Equations
- Standard form: `ax^2 + bx + c = 0`
- Quadratic formula: `x = (-b +/- sqrt(b^2 - 4ac)) / 2a`
- Discriminant: `D = b^2 - 4ac`
  - D > 0: two real roots
  - D = 0: one repeated root
  - D < 0: two complex roots
- Vertex form: `y = a(x - h)^2 + k` where (h, k) is the vertex
- Sum of roots: `-b/a`. Product of roots: `c/a`.

### Factoring Patterns
- Difference of squares: `a^2 - b^2 = (a+b)(a-b)`
- Perfect square trinomial: `a^2 + 2ab + b^2 = (a+b)^2`
- Sum of cubes: `a^3 + b^3 = (a+b)(a^2 - ab + b^2)`
- Difference of cubes: `a^3 - b^3 = (a-b)(a^2 + ab + b^2)`

## Trigonometry

### Core Identities
- `sin^2(x) + cos^2(x) = 1`
- `1 + tan^2(x) = sec^2(x)`
- `1 + cot^2(x) = csc^2(x)`

### Double Angle Formulas
- `sin(2x) = 2sin(x)cos(x)`
- `cos(2x) = cos^2(x) - sin^2(x) = 2cos^2(x) - 1 = 1 - 2sin^2(x)`
- `tan(2x) = 2tan(x) / (1 - tan^2(x))`

### Unit Circle Key Values
| Angle (rad) | Angle (deg) | sin | cos | tan |
|-------------|-------------|-----|-----|-----|
| 0 | 0 | 0 | 1 | 0 |
| pi/6 | 30 | 1/2 | sqrt(3)/2 | sqrt(3)/3 |
| pi/4 | 45 | sqrt(2)/2 | sqrt(2)/2 | 1 |
| pi/3 | 60 | sqrt(3)/2 | 1/2 | sqrt(3) |
| pi/2 | 90 | 1 | 0 | undefined |
| pi | 180 | 0 | -1 | 0 |
| 3pi/2 | 270 | -1 | 0 | undefined |
| 2pi | 360 | 0 | 1 | 0 |

## Calculus

### Derivatives (Common Rules)
- Power rule: `d/dx[x^n] = nx^(n-1)`
- Product rule: `d/dx[f*g] = f'*g + f*g'`
- Quotient rule: `d/dx[f/g] = (f'*g - f*g') / g^2`
- Chain rule: `d/dx[f(g(x))] = f'(g(x)) * g'(x)`

### Derivatives (Common Functions)
- `d/dx[sin(x)] = cos(x)`
- `d/dx[cos(x)] = -sin(x)`
- `d/dx[tan(x)] = sec^2(x)`
- `d/dx[e^x] = e^x`
- `d/dx[ln(x)] = 1/x`
- `d/dx[a^x] = a^x * ln(a)`

### Integration (Common Forms)
- `integral[x^n dx] = x^(n+1)/(n+1) + C` (n != -1)
- `integral[1/x dx] = ln|x| + C`
- `integral[e^x dx] = e^x + C`
- `integral[sin(x) dx] = -cos(x) + C`
- `integral[cos(x) dx] = sin(x) + C`

### Integration by Parts
Formula: `integral[u dv] = uv - integral[v du]`

**LIATE rule for choosing u** (pick whichever comes first):
1. **L**ogarithmic (ln, log)
2. **I**nverse trig (arcsin, arctan)
3. **A**lgebraic (polynomials)
4. **T**rigonometric (sin, cos)
5. **E**xponential (e^x)

### The Fundamental Theorem of Calculus
- Part 1: `d/dx[integral from a to x of f(t) dt] = f(x)`
- Part 2: `integral from a to b of f(x) dx = F(b) - F(a)`

## Logarithms and Exponentials

### Properties
- `log(ab) = log(a) + log(b)`
- `log(a/b) = log(a) - log(b)`
- `log(a^n) = n * log(a)`
- `log_b(x) = ln(x) / ln(b)` (change of base)
- `b^(log_b(x)) = x`
- `e^(ln(x)) = x`

## Sequences and Series

### Arithmetic Sequence
- `a_n = a_1 + (n-1)d`
- Sum of first n terms: `S_n = n(a_1 + a_n) / 2`

### Geometric Sequence
- `a_n = a_1 * r^(n-1)`
- Sum of first n terms: `S_n = a_1(1 - r^n) / (1 - r)`
- Infinite sum (if |r| < 1): `S = a_1 / (1 - r)`

## Probability and Statistics

- Mean: `x_bar = sum(x_i) / n`
- Variance: `sigma^2 = sum((x_i - x_bar)^2) / n`
- Standard deviation: `sigma = sqrt(variance)`
- Combinations: `C(n,k) = n! / (k!(n-k)!)`
- Permutations: `P(n,k) = n! / (n-k)!`
