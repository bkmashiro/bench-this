# @bench
def add_numbers(a, b):
    return a + b


# @bench label="List sort"
def sort_list(lst):
    return sorted(lst)


# not benchmarked
def helper():
    return 42
