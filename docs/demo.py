from collections import deque


# ============================================================
# 1. 六边形棋盘的六个相邻方向
# ============================================================

DIRECTIONS = [
    (-1, 0),
    (-1, 1),
    (0, -1),
    (0, 1),
    (1, -1),
    (1, 0)
]


def get_neighbors(board, r, c):
    """获取六边形棋盘中某个位置的相邻位置"""
    rows = len(board)
    cols = len(board[0])

    neighbors = []

    for dr, dc in DIRECTIONS:
        nr = r + dr
        nc = c + dc

        if 0 <= nr < rows and 0 <= nc < cols:
            neighbors.append((nr, nc))

    return neighbors


# ============================================================
# 2. 获取某个格子的最上层棋子
# ============================================================

def get_top(piece):
    """
    piece:
        "G"                -> 单个棋子
        ["T", "G"]         -> 叠放棋子
        []                 -> 空格
    """

    if piece == "." or piece == []:
        return None

    if isinstance(piece, list):
        if len(piece) == 0:
            return None
        return piece[-1]

    return piece


# ============================================================
# 3. 树木计分
# ============================================================

def score_trees(board):
    """
    树木：
    G              = 1分
    T + G          = 3分
    T + T + G      = 7分
    """

    score = 0

    for row in board:
        for piece in row:

            if not isinstance(piece, list):
                continue

            # 最上层必须是绿色
            if len(piece) == 1 and piece[-1] == "G":
                score += 1

            elif len(piece) == 2:
                if piece == ["T", "G"]:
                    score += 3

            elif len(piece) == 3:
                if piece == ["T", "T", "G"]:
                    score += 7

    return score


# ============================================================
# 4. 山脉计分
# ============================================================

def score_mountains(board):
    """
    山脉：
    M       = 1分
    M + M   = 3分
    M + M + M = 7分

    额外要求：
    这座山必须与另一座山相邻。
    """

    mountains = []

    for r in range(len(board)):
        for c in range(len(board[0])):

            piece = board[r][c]

            if isinstance(piece, list):

                if len(piece) in [1, 2, 3] and all(x == "M" for x in piece):
                    mountains.append((r, c))

    score = 0

    for r, c in mountains:

        # 检查附近是否存在另一座山
        has_neighbor = False

        for nr, nc in get_neighbors(board, r, c):

            neighbor = board[nr][nc]

            if isinstance(neighbor, list):
                if len(neighbor) in [1, 2, 3] and all(
                    x == "M" for x in neighbor
                ):
                    has_neighbor = True
                    break

        if not has_neighbor:
            continue

        height = len(board[r][c])

        if height == 1:
            score += 1
        elif height == 2:
            score += 3
        elif height == 3:
            score += 7

    return score


# ============================================================
# 5. 田野计分
# ============================================================

def score_fields(board):
    """
    至少2个相连黄色棋子形成一个田野。
    每个独立田野 = 5分。
    """

    visited = set()
    score = 0

    for r in range(len(board)):
        for c in range(len(board[0])):

            if (r, c) in visited:
                continue

            if get_top(board[r][c]) != "Y":
                continue

            # BFS寻找整个黄色区域
            queue = deque([(r, c)])
            visited.add((r, c))

            count = 0

            while queue:

                cr, cc = queue.popleft()
                count += 1

                for nr, nc in get_neighbors(board, cr, cc):

                    if (nr, nc) in visited:
                        continue

                    if get_top(board[nr][nc]) == "Y":
                        visited.add((nr, nc))
                        queue.append((nr, nc))

            # 至少两个黄色棋子
            if count >= 2:
                score += 5

    return score


# ============================================================
# 6. 建筑计分
# ============================================================

def score_buildings(board):
    """
    红色棋子放在：
        T（棕色）
        M（灰色）
        R（红色）

    建筑周围相邻位置的顶层棋子至少有3种不同颜色：
        5分

    否则：
        0分
    """

    score = 0

    for r in range(len(board)):
        for c in range(len(board[0])):

            piece = board[r][c]

            if not isinstance(piece, list):
                continue

            # 红色建筑
            if len(piece) == 0 or piece[-1] != "R":
                continue

            # 红色必须建立在 T / M / R 上
            if len(piece) < 2:
                continue

            if piece[-2] not in ["T", "M", "R"]:
                continue

            colors = set()

            for nr, nc in get_neighbors(board, r, c):

                top = get_top(board[nr][nc])

                if top is not None:
                    colors.add(top)

            if len(colors) >= 3:
                score += 5

    return score


# ============================================================
# 7. 河流计分
# ============================================================

def score_rivers(board):
    """
    A面河流计分：

    长度：
    1 -> 0
    2 -> 2
    3 -> 5
    4 -> 8
    5 -> 11
    6 -> 15

    超过6：
    每增加1格 +4分
    """

    visited = set()
    river_lengths = []

    for r in range(len(board)):
        for c in range(len(board[0])):

            if (r, c) in visited:
                continue

            if get_top(board[r][c]) != "B":
                continue

            queue = deque([(r, c)])
            visited.add((r, c))

            count = 0

            while queue:

                cr, cc = queue.popleft()
                count += 1

                for nr, nc in get_neighbors(board, cr, cc):

                    if (nr, nc) in visited:
                        continue

                    if get_top(board[nr][nc]) == "B":
                        visited.add((nr, nc))
                        queue.append((nr, nc))

            river_lengths.append(count)

    if not river_lengths:
        return 0

    # 只计算最长河流
    longest = max(river_lengths)

    if longest == 1:
        return 0

    if longest == 2:
        return 2

    if longest == 3:
        return 5

    if longest == 4:
        return 8

    if longest == 5:
        return 11

    if longest == 6:
        return 15

    return 15 + (longest - 6) * 4


# ============================================================
# 8. 岛屿计分（B面）
# ============================================================

def score_islands(board):
    """
    B面：
    每个岛屿 = 5分。

    这里把非蓝色区域作为岛屿区域处理。
    """

    visited = set()
    islands = 0

    for r in range(len(board)):
        for c in range(len(board[0])):

            if (r, c) in visited:
                continue

            if get_top(board[r][c]) == "B":
                continue

            # 搜索一个非蓝色区域
            queue = deque([(r, c)])
            visited.add((r, c))

            while queue:

                cr, cc = queue.popleft()

                for nr, nc in get_neighbors(board, cr, cc):

                    if (nr, nc) in visited:
                        continue

                    if get_top(board[nr][nc]) != "B":
                        visited.add((nr, nc))
                        queue.append((nr, nc))

            islands += 1

    # 至少一个岛屿
    if islands == 0:
        islands = 1

    return islands * 5


# ============================================================
# 9. 计算全部地形分
# ============================================================

def calculate_terrain_score(board, side="A"):
    """
    side="A"：
        蓝色按照河流计分

    side="B"：
        蓝色按照岛屿计分
    """

    tree_score = score_trees(board)
    mountain_score = score_mountains(board)
    field_score = score_fields(board)
    building_score = score_buildings(board)

    if side == "A":
        blue_score = score_rivers(board)
        blue_name = "河流"
    else:
        blue_score = score_islands(board)
        blue_name = "岛屿"

    total = (
        tree_score
        + mountain_score
        + field_score
        + building_score
        + blue_score
    )

    print("========== 地形计分 ==========")
    print(f"树木：{tree_score} 分")
    print(f"山脉：{mountain_score} 分")
    print(f"田野：{field_score} 分")
    print(f"建筑：{building_score} 分")
    print(f"{blue_name}：{blue_score} 分")
    print("-----------------------------")
    print(f"地形总分：{total} 分")

    return total


# ============================================================
# 10. 测试棋盘
# ============================================================

board = [

    [
        ["T", "G"],
        ["Y"],
        ["Y"],
        ".",
        ["M"]
    ],

    [
        ["T", "T", "G"],
        ["B"],
        ["B"],
        ["Y"],
        ["M", "M"]
    ],

    [
        ".",
        ["B"],
        ["B"],
        ["Y"],
        ["M"]
    ],

    [
        ["R", "R"],
        ["B"],
        ".",
        ["Y"],
        "."
    ],

    [
        ".",
        ".",
        ".",
        ".",
        "."
    ]
]


# A面：河流计分
calculate_terrain_score(board, side="A")

print()

# B面：岛屿计分
calculate_terrain_score(board, side="B")