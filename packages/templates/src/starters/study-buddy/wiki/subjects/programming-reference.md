# Programming Reference — Core Patterns and Concepts

A reference guide covering fundamental programming concepts, common patterns, and code structures. Useful for building flashcards, understanding interview problems, and learning new languages.

## Data Structures

### Arrays (Lists)
Ordered, indexed collections. O(1) access by index, O(n) search, O(n) insert/delete.

```python
# Python
nums = [1, 2, 3, 4, 5]
nums.append(6)         # Add to end
nums.pop()             # Remove from end
nums.insert(0, 0)      # Insert at index
nums.sort()            # Sort in place
reversed(nums)         # Reverse iterator
```

```javascript
// JavaScript
const nums = [1, 2, 3, 4, 5];
nums.push(6);           // Add to end
nums.pop();             // Remove from end
nums.unshift(0);        // Add to start
nums.slice(1, 3);       // Subarray [1, 3)
nums.filter(n => n > 2); // Filter
nums.map(n => n * 2);   // Transform
```

### Hash Maps (Dictionaries)
Key-value pairs. O(1) average lookup, insert, delete.

```python
# Python
scores = {"alice": 95, "bob": 87}
scores["charlie"] = 92     # Add/update
del scores["bob"]           # Delete
scores.get("dave", 0)      # Safe get with default
scores.keys()               # All keys
scores.values()             # All values
scores.items()              # Key-value pairs
```

```javascript
// JavaScript
const scores = new Map();
scores.set("alice", 95);
scores.get("alice");         // 95
scores.has("bob");           // false
scores.delete("alice");      // Remove entry
scores.size;                 // Number of entries
```

### Linked Lists
Sequential nodes with pointers. O(1) insert/delete at known position, O(n) search.

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

# Traversal
current = head
while current:
    print(current.val)
    current = current.next
```

### Stacks
Last-in, first-out (LIFO). O(1) push and pop.

```python
stack = []
stack.append("a")    # Push
stack.append("b")
top = stack.pop()    # Pop -> "b"
peek = stack[-1]     # Peek -> "a"
```

Use cases: undo/redo, balanced parentheses, depth-first search, expression evaluation.

### Queues
First-in, first-out (FIFO). O(1) enqueue and dequeue.

```python
from collections import deque
queue = deque()
queue.append("a")         # Enqueue
queue.append("b")
first = queue.popleft()   # Dequeue -> "a"
peek = queue[0]           # Peek -> "b"
```

Use cases: breadth-first search, task scheduling, buffer management.

## Common Algorithms

### Binary Search
Search sorted array in O(log n) time.

```python
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
```

### Sorting Algorithms Comparison

| Algorithm | Best | Average | Worst | Space | Stable |
|-----------|------|---------|-------|-------|--------|
| Bubble Sort | O(n) | O(n^2) | O(n^2) | O(1) | Yes |
| Merge Sort | O(n log n) | O(n log n) | O(n log n) | O(n) | Yes |
| Quick Sort | O(n log n) | O(n log n) | O(n^2) | O(log n) | No |
| Heap Sort | O(n log n) | O(n log n) | O(n log n) | O(1) | No |

### Big-O Complexity Classes (Fastest to Slowest)

1. O(1) — Constant: hash lookup, array index
2. O(log n) — Logarithmic: binary search, balanced BST operations
3. O(n) — Linear: single loop, linear scan
4. O(n log n) — Linearithmic: merge sort, heap sort
5. O(n^2) — Quadratic: nested loops, bubble sort
6. O(2^n) — Exponential: recursive Fibonacci, power set
7. O(n!) — Factorial: permutations, traveling salesman brute force

## Object-Oriented Programming

### Four Pillars

1. **Encapsulation** — Bundle data and methods together. Hide internal state behind an interface.
2. **Abstraction** — Show only what matters. Hide complexity behind simple interfaces.
3. **Inheritance** — Create specialized classes from general ones. "Is-a" relationship.
4. **Polymorphism** — Same interface, different implementations. A function that works on many types.

### Class Example

```python
class Animal:
    def __init__(self, name, sound):
        self._name = name        # Protected convention
        self._sound = sound

    def speak(self):
        return f"{self._name} says {self._sound}"

class Dog(Animal):
    def __init__(self, name):
        super().__init__(name, "Woof")

    def fetch(self, item):
        return f"{self._name} fetches the {item}"

# Polymorphism in action
animals = [Dog("Rex"), Animal("Cat", "Meow")]
for animal in animals:
    print(animal.speak())  # Each speaks differently
```

## Recursion Patterns

### Base Case + Recursive Case

Every recursive function needs:
1. A **base case** that stops recursion
2. A **recursive case** that moves toward the base case

```python
# Factorial
def factorial(n):
    if n <= 1:          # Base case
        return 1
    return n * factorial(n - 1)  # Recursive case

# Fibonacci (with memoization to avoid O(2^n))
from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
```

## Error Handling

```python
# Python
try:
    result = risky_operation()
except ValueError as e:
    print(f"Bad value: {e}")
except Exception as e:
    print(f"Something went wrong: {e}")
finally:
    cleanup()
```

```javascript
// JavaScript
try {
    const result = riskyOperation();
} catch (error) {
    console.error(`Error: ${error.message}`);
} finally {
    cleanup();
}
```

## String Manipulation

```python
# Common patterns
s = "Hello, World!"
s.lower()              # "hello, world!"
s.upper()              # "HELLO, WORLD!"
s.split(", ")          # ["Hello", "World!"]
", ".join(["a", "b"])  # "a, b"
s.replace("World", "Python")  # "Hello, Python!"
s.strip()              # Remove leading/trailing whitespace
s[0:5]                 # Slicing: "Hello"
len(s)                 # Length: 13
f"Name: {name}"        # F-string formatting
```

## Tips for Learning Programming

1. **Type code, do not copy-paste** — Muscle memory matters for learning syntax
2. **Break things on purpose** — Read error messages and understand what they mean
3. **Use print statements liberally** — See what your code is actually doing step by step
4. **Solve the same problem three ways** — Builds flexible thinking
5. **Explain your code out loud** — The Feynman technique applies to programming too
6. **Read other people's code** — You learn patterns and idioms from exposure
7. **Start with pseudocode** — Write the logic in plain English before writing syntax
