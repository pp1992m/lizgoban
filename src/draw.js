// -*- coding: utf-8 -*-

/////////////////////////////////////////////////
// setup

require('./common.js').to(global)

// color constant
const BLACK = "#000", WHITE = "#fff"
const GRAY = "#ccc", DARK_GRAY = "#444"
const RED = "#f00", GREEN = "#0c0", BLUE = "#88f", YELLOW = "#ff0"
const ORANGE = "#fc8d49"
const DARK_YELLOW = "#c9a700", TRANSPARENT = "rgba(0,0,0,0)"
const MAYBE_BLACK = "rgba(0,0,0,0.5)", MAYBE_WHITE = "rgba(255,255,255,0.5)"
const VAGUE_BLACK = 'rgba(0,0,0,0.3)', VAGUE_WHITE = 'rgba(255,255,255,0.3)'
const PALE_BLUE = "rgba(128,128,255,0.5)"
const PALE_BLACK = "rgba(0,0,0,0.1)", PALE_WHITE = "rgba(255,255,255,0.3)"
const PALER_BLACK = "rgba(0,0,0,0.07)", PALER_WHITE = "rgba(255,255,255,0.21)"
const PALE_RED = "rgba(255,0,0,0.1)", PALE_GREEN = "rgba(0,255,0,0.1)"
const WINRATE_TRAIL_COLOR = 'rgba(160,160,160,0.8)'
const WINRATE_BAR_ORDER_COLOR = '#d00', WINRATE_BAR_FIRST_ORDER_COLOR = '#0a0'
const EXPECTED_COLOR = 'rgba(0,0,255,0.3)', UNEXPECTED_COLOR = 'rgba(255,0,0,0.8)'
// p: pausing, t: trial
const GOBAN_BG_COLOR = {"": "#f9ca91", p: "#a38360", t: "#a38360", pt: "#a09588"}

// state
let R = {}, target_move = null
function set_state(given_R) {R = given_R}  // fixme: ugly

// util
function f2s(z, digits) {return truep(z) ? z.toFixed(truep(digits) ? digits : 1) : ''}

/////////////////////////////////////////////////
// various gobans

function draw_raw_goban(canvas, options) {
    const u = options.show_until
    u ? draw_goban_until(canvas, u, options) : draw_goban(canvas, null, options)
}

function draw_main_goban(canvas, options) {
    const opts = {draw_visits_p: true, read_only: R.attached, ...options}
    const u = options.show_until, h = options.selected_suggest
    target_move = !u && (h.visits > 0) && h.move
    // case I: "variation"
    if (target_move) {draw_goban_with_variation(canvas, h, opts); return}
    // case II: "suggest" or "until"
    const mapping_to_winrate_bar = h.move && mapping_text(h, opts)
    u ? draw_goban_until(canvas, u, opts)
        : draw_goban_with_suggest(canvas, {...opts, mapping_to_winrate_bar})
}

function draw_goban_until(canvas, show_until, opts) {
    const all_p = [R.move_count, Infinity].includes(show_until)
    const displayed_stones = stones_until(show_until, all_p)
    draw_goban(canvas, displayed_stones,
               {draw_last_p: true, draw_next_p: true,
                draw_endstate_diff_p: R.show_endstate, ...opts})
}

function stones_until(show_until, all_p, for_endstate) {
    // fixme: need cleaning (for_endstate)
    const recent_moves = 3, thick_moves = 7
    const unnumbered = for_endstate ? Infinity :
          all_p ? 0 : clip(show_until - recent_moves, 0)
    const highlighted_after = for_endstate ? Infinity :
          all_p ? clip(show_until, 0, R.history_length) - recent_moves : show_until - 1
    const thin_before =  for_endstate ? 0 :
          all_p ? highlighted_after - thick_moves + 1 : 0
    const displayed_stones = copy_stones_for_display()
    each_stone(displayed_stones, (h, idx) => {
        const ss = h.anytime_stones, target = latest_move(ss, show_until)
        if (target) {
            h.black = target.is_black
            h.last = [show_until, thin_before - 1].includes(target.move_count)
            h.displayed_colors = h.stone ? [BLACK, WHITE] : [MAYBE_BLACK, MAYBE_WHITE]
            h.stone = true
            const m = target.move_count - unnumbered
            const variation_last = (target.move_count > highlighted_after)
            const thin_movenums = (target.move_count < thin_before)
            // clean me: to_s to avoid highlight of "1"
            m > 0 && merge(h, {movenums: [to_s(m)], variation_last,
                               thin_movenums, tag: null})
        } else {
            for_endstate && (h.stone = false)
            h.stone && ((h.displayed_colors = [PALER_BLACK, PALER_WHITE]),
                        (h.last = false))
        }
        h.displayed_tag = h.tag
        const next_stone = ss && ss.find(z => (z.move_count === show_until + 1))
        h.next_move = !!next_stone; h.next_is_black = (next_stone || {}).is_black
    })
    return displayed_stones
}

function draw_goban_with_suggest(canvas, opts) {
    const displayed_stones = copy_stones_for_display()
    R.suggest.forEach(h => merge_stone_at(h.move, displayed_stones, {suggest: true, data: h}))
    each_stone(displayed_stones, (h, idx) => (h.displayed_tag = h.tag && h.stone))
    const s0 = R.suggest[0]
    const expected_move = expected_pv()[0]
    expected_move && !empty(R.suggest) && s0.move !== expected_move &&
        set_expected_stone(expected_move, s0.move, displayed_stones)
    draw_goban(canvas, displayed_stones,
               {draw_last_p: true, draw_next_p: true, draw_expected_p: true,
                draw_endstate_p: R.show_endstate, draw_endstate_diff_p: R.show_endstate,
                tag_clickable_p: true, mapping_tics_p: !opts.main_canvas_p, ...opts})
}

function draw_goban_with_variation(canvas, suggest, opts) {
    const reliable_moves = 7
    const variation = suggest.pv || []
    const expected = expected_pv()
    let mark_unexpected_p = (expected[0] === variation[0]) || opts.force_draw_expected_p
    const displayed_stones = copy_stones_for_display()
    variation.forEach((move, k) => {
        const b = xor(R.bturn, k % 2 === 1), w = !b, expected_move = expected[k]
        merge_stone_at(move, displayed_stones, {
            stone: true, black: b, white: w,
            variation: true, movenums: [k + 1],
            variation_last: k === variation.length - 1, is_vague: k >= reliable_moves
        })
        if (mark_unexpected_p && expected_move && expected_move !== move) {
            set_expected_stone(expected[k], move, displayed_stones)
            mark_unexpected_p = false
        }
    })
    const mapping_to_winrate_bar = mapping_text(suggest, opts)
    draw_goban(canvas, displayed_stones,
               {draw_last_p: true, draw_expected_p: true,
                mapping_to_winrate_bar, ...opts})
}

function draw_goban_with_principal_variation(canvas, options) {
    const opts = {read_only: true, force_draw_expected_p: true,
                  mapping_to_winrate_bar: false, ...options}
    draw_goban_with_variation(canvas, R.suggest[0] || {}, opts)
}

function draw_endstate_goban(canvas, options) {
    const past_p = past_endstate_p(options.draw_endstate_value_p)
    const scores = winrate_history_values_of('score_without_komi')
    const {show_until} = options, mc = R.move_count
    const past_mc = (truep(show_until) && show_until !== mc) ?
          show_until : R.move_count - R.endstate_diff_interval
    const past_score = scores[past_mc]
    const past_text = (d_i, es) =>
          `  at ${past_mc} (${Math.abs(d_i)} move${Math.abs(d_i) > 1 ? 's' : ''} ${d_i > 0 ? 'before' : 'after'})` +
          (truep(es) ? `  endstate = ${f2s(es)}` : '')
    const common = {read_only: true, draw_endstate_p: R.show_endstate,
                    draw_endstate_diff_p: R.show_endstate}
    const current = {draw_visits_p: true, draw_next_p: true}
    const past = {draw_visits_p: past_text(R.move_count - past_mc, past_score)}
    const opts = {...common, ...(past_p ? past : current), ...(options || {})}
    const displayed_stones = past_p ? stones_until(past_mc, false, true) : R.stones
    draw_goban(canvas, displayed_stones, opts)
}

/////////////////////////////////////////////////
// generic goban

function draw_goban(canvas, stones, opts) {
    const {draw_last_p, draw_next_p, draw_visits_p, draw_expected_p, first_board_p,
           draw_endstate_p, draw_endstate_diff_p, draw_endstate_value_p,
           tag_clickable_p, read_only, mapping_tics_p, mapping_to_winrate_bar,
           hovered_move, show_until, main_canvas_p, handle_mouse_on_goban}
          = opts || {}
    const {margin, hm, g, idx2coord, coord2idx, unit} = goban_params(canvas)
    const large_font_p = !main_canvas_p
    const font_unit = Math.min(margin, canvas.height / 20)
    // clear
    g.strokeStyle = BLACK; g.fillStyle = goban_bg(true); g.lineWidth = 1
    edged_fill_rect([0, 0], [canvas.width, canvas.height], g)
    g.fillStyle = goban_bg()
    fill_rect([hm, hm], [canvas.width - hm, canvas.height - hm], g)
    // draw
    draw_grid(unit, idx2coord, g)
    mapping_tics_p && draw_mapping_tics(unit, canvas, g)
    draw_visits_p && draw_visits(draw_visits_p, font_unit, canvas, g)
    first_board_p && draw_progress(!main_canvas_p, margin, canvas, g)
    mapping_to_winrate_bar && !(draw_endstate_value_p && draw_endstate_p) &&
        draw_mapping_text(mapping_to_winrate_bar, font_unit, canvas, g)
    !read_only && hovered_move && draw_cursor(hovered_move, unit, idx2coord, g)
    const drawp = {
        draw_last_p, draw_next_p, draw_expected_p,
        draw_endstate_p, draw_endstate_diff_p, draw_endstate_value_p, large_font_p,
        tag_clickable_p, hovered_move, show_until,
    }
    draw_on_board(stones || R.stones, drawp, unit, idx2coord, g)
    draw_endstate_p && draw_endstate_clusters(draw_endstate_value_p, unit, idx2coord, g)
    // mouse events
    handle_mouse_on_goban(canvas, coord2idx, read_only, tag_clickable_p)
}

function goban_params(canvas) {
    const w = canvas.width, h = canvas.height, g = canvas.getContext("2d")
    const margin = Math.min(w, h) / (board_size() + 1), hm = margin / 2
    const [idx2coord, coord2idx] = idx2coord_translator_pair(canvas, margin, margin, true)
    const unit = idx2coord(0, 1)[0] - idx2coord(0, 0)[0], half_unit = unit / 2
    return {w, h, g, margin, hm, idx2coord, coord2idx, unit, half_unit}
}

function draw_grid(unit, idx2coord, g) {
    g.strokeStyle = BLACK; g.fillStyle = BLACK; g.lineWidth = 1
    seq(board_size()).forEach(i => {
        line(idx2coord(i, 0), idx2coord(i, board_size() - 1), g)
        line(idx2coord(0, i), idx2coord(board_size() - 1, i), g)
    })
    const star_radius = unit * 0.1, ijs = stars[board_size()] || []
    ijs.forEach(ij => fill_circle(idx2coord(...ij), star_radius, g))
}

function draw_visits(text_maybe, margin, canvas, g) {
    if (typeof text_maybe === 'string') {
        draw_visits_text(text_maybe, margin, canvas, g); return
    }
    if (!truep(R.visits)) {return}
    const maybe = (z, g) => truep(z) ? g(z >= 1000 ? kilo_str(z) : f2s(z)) : ''
    const vps = maybe(R.visits_per_sec, z => `  (${z} v/s)`)
    const esum = maybe(R.endstate_sum, z => `  endstate = ${z}`)
    const text = `  visits = ${R.visits}${esum}${vps}`
    draw_visits_text(text, margin, canvas, g)
}

function draw_visits_text(text, margin, canvas, g) {
    g.save()
    g.fillStyle = MAYBE_BLACK
    g.textAlign = 'left'; g.textBaseline = 'middle'
    fill_text(g, margin / 2, text, 0, margin / 4)
    g.restore()
}

function draw_progress(highlightp, margin, canvas, g) {
    if (R.progress < 0) {return}
    g.fillStyle = highlightp ? GREEN : R.bturn ? BLACK : WHITE
    fill_rect([0, canvas.height - margin / 10],
              [canvas.width * R.progress, canvas.height], g)
}

function draw_cursor(hovered_move, unit, idx2coord, g) {
    const [i, j] = move2idx(hovered_move); if (i < 0) {return}
    const xy = idx2coord(i, j)
    g.fillStyle = R.bturn ? PALE_BLACK : PALE_WHITE
    fill_circle(xy, unit / 4, g)
}

function draw_on_board(stones, drawp, unit, idx2coord, g) {
    const {draw_last_p, draw_next_p, draw_expected_p,
           draw_endstate_p, draw_endstate_diff_p, draw_endstate_value_p,
           large_font_p, tag_clickable_p, hovered_move, show_until}
          = drawp
    const stone_radius = unit * 0.5
    const draw_exp = (move, exp_p, h, xy) => draw_expected_p && move &&
          draw_expected_mark(h, xy, exp_p, stone_radius, g)
    const each_coord =
          proc => each_stone(stones, (h, idx) => proc(h, idx2coord(...idx), idx))
    if (draw_endstate_value_p && draw_endstate_p) {
        const past_p = past_endstate_p(draw_endstate_value_p)
        draw_endstate_stones(each_coord, past_p, show_until, stone_radius, g); return
    }
    each_coord((h, xy, idx) => {
        const next_p = draw_next_p && h.next_move
        draw_endstate_p && draw_endstate(h.endstate, xy, stone_radius, g)
        draw_expected_p && (draw_exp(h.expected_move, true, h, xy),
                            draw_exp(h.unexpected_move, false, h, xy))
        h.stone ? draw_stone(h, xy, stone_radius, draw_last_p, g) :
            h.suggest ? draw_suggest(h, xy, stone_radius, large_font_p, next_p, g) :
            next_p ? draw_next_move(h, xy, stone_radius, g) : null
        const highlight_tag_p = tag_clickable_p && idx2move(...idx) === hovered_move
        h.displayed_tag && draw_tag(h.tag, xy, stone_radius, highlight_tag_p, g)
        if (empty(R.suggest)) {return}
        draw_endstate_diff_p && draw_endstate_diff(h.endstate_diff, xy, stone_radius, g)
    })
    !R.lizzie_style && each_coord((h, xy) => h.suggest && (h.data.visits > 0)
                                  && draw_winrate_mapping_line(h, xy, unit, g))
}

function draw_endstate_stones(each_coord, past_p, show_until, stone_radius, g) {
    if (past_p && !R.prev_endstate_clusters) {return}
    const mc = R.move_count
    const d = (!truep(show_until) || show_until === R.move_count) ? R.endstate_diff_interval : (R.move_count - show_until)
    const sign = Math.sign(d)
    each_coord((h, xy, idx) => {
        const stone_p = h.stone
        past_p && draw_endstate(h.endstate_diff, xy, stone_radius, g)
        stone_p && draw_stone(h, xy, stone_radius, true, g)
        past_p && h.next_move && draw_next_move(h, xy, stone_radius, g)
        draw_endstate_value(h, past_p, sign, xy, stone_radius, g)
    })
}

function goban_bg(border) {
    return GOBAN_BG_COLOR[(R.pausing ? 'p' : '') + (R.trial && border ? 't' : '')]
}

function draw_endstate_clusters(boundary_p, unit, idx2coord, g) {
    const style = boundary_p ?
          {black: 'rgba(0,255,255,0.5)', white: 'rgba(255,0,0,0.5)'} :
          {black: 'rgba(0,255,0,0.2)', white: 'rgba(255,0,255,0.2)'}
    const size = {major: 3, minor: 2}
    const past_p = past_endstate_p(boundary_p)
    const cs = (past_p ? R.prev_endstate_clusters : R.endstate_clusters) || []
    cs.forEach(cluster => {
        const {color, type, ownership_sum, selfstone_sum, center_idx} = cluster
        const area_count = Math.round(Math.sign(ownership_sum) *
                                      (ownership_sum - selfstone_sum))
        if (area_count < 1) {return}
        boundary_p && draw_endstate_boundary(cluster, unit, idx2coord, g)
        const text = to_s(area_count), xy = idx2coord(...center_idx)
        g.save()
        g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillStyle = style[color]; fill_text(g, size[type] * unit, text, ...xy)
        g.restore()
    })
    const selfstone_sum = Math.round(sum(cs.map(cluster => cluster.selfstone_sum)))
    const ss_text = selfstone_sum === 0 ? '' : `+${to_s(Math.abs(selfstone_sum))}`
    g.save()
    g.textAlign = 'right'; g.textBaseline = 'top'
    g.fillStyle = style[selfstone_sum > 0 ? 'black' : 'white']
    fill_text(g, size['minor'] * unit, ss_text, ...idx2coord(-1.3, board_size()))
    g.restore()
}

function draw_endstate_boundary(cluster, unit, idx2coord, g) {
    const style = {black: '#080', white: '#c4c'}
    cluster.boundary.forEach(([ij, direction]) => {
        const width = unit * 0.1, r = unit / 2
        const [di, dj] = around_idx_diff[direction]
        const [qi, qj] = [Math.abs(dj), Math.abs(di)]
        const mul = (a, coef) => a.map(z => z * coef)
        // See coord.js for the relation between [i][j] and (x, y).
        const [dx, dy] = mul([dj, di], r - width / 2), [qx, qy] = mul([qj, qi], r)
        const [x0, y0] = idx2coord(...ij), [x, y] = [x0 + dx, y0 + dy]
        g.strokeStyle = style[cluster.color]; g.lineWidth = width
        line([x - qx, y - qy], [x + qx, y + qy], g)
    })
}

function past_endstate_p(flag) {return flag === 'past'}

/////////////////////////////////////////////////
// on goban grids

// stone

function draw_stone(h, xy, radius, draw_last_p, g) {
    const [b_color, w_color] = h.displayed_colors ||
          (h.maybe ? [MAYBE_BLACK, MAYBE_WHITE] :
           h.maybe_empty ? [PALE_BLACK, PALE_WHITE] :
           h.is_vague ? [VAGUE_BLACK, VAGUE_WHITE] :
           [BLACK, WHITE])
    g.lineWidth = 1; g.strokeStyle = b_color
    g.fillStyle = h.black ? b_color : w_color
    edged_fill_circle(xy, radius, g)
    draw_last_p && h.last && draw_last_move(h, xy, radius, g)
    h.movenums && draw_movenums(h, xy, radius, g)
}

function draw_movenums(h, xy, radius, g) {
    const movenums = num_sort(h.movenums)
    const bw = h.thin_movenums ? ['rgba(0,0,0,0.2)', 'rgba(255,255,255,0.3)'] :
          h.is_vague ? [MAYBE_BLACK, MAYBE_WHITE] : [BLACK, WHITE]
    const color = (movenums[0] === 1) ? GREEN : h.variation_last ? RED :
          bw[h.black ? 1 : 0]
    draw_text_on_stone(movenums.join(','), color, xy, radius, g)
}

function draw_tag(tag, xy, radius, highlight_tag_p, g) {
    draw_text_on_stone(tag, highlight_tag_p ? GREEN : BLUE, xy, radius, g)
}

function draw_text_on_stone(text, color, xy, radius, g) {
    const l = text.length, [x, y] = xy, max_width = radius * 1.5
    const fontsize = to_i(radius * (l < 3 ? 1.8 : l < 6 ? 1.2 : 0.9))
    g.save()
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = color; fill_text(g, fontsize, text, x, y, max_width)
    g.restore()
}

function draw_last_move(h, xy, radius, g) {
    g.strokeStyle = h.black ? WHITE : BLACK; g.lineWidth = 2
    circle(xy, radius * 0.8, g)
}

function draw_next_move(h, xy, radius, g) {
    g.strokeStyle = h.next_is_black ? BLACK : WHITE; g.lineWidth = 3; circle(xy, radius, g)
}

// suggestions

// suggest_as_stone = {suggest: true, data: suggestion_data}
// See "suggestion reader" section in engine.js for suggestion_data.

function draw_suggest(h, xy, radius, large_font_p, next_p, g) {
    if (h.data.visits === 0) {draw_suggest_0visits(h, xy, radius, g); return}
    const suggest = h.data, {stroke, fill, lizzie_text_color} = suggest_color(suggest)
    g.lineWidth = 1; g.strokeStyle = stroke; g.fillStyle = fill
    edged_fill_circle(xy, radius, g)
    next_p && draw_next_move(h, xy, radius, g)
    draw_suggestion_order(h, xy, radius, g.strokeStyle, large_font_p, g)
    if (R.lizzie_style) {
        const [x, y] = xy, max_width = radius * 1.8, champ_color = RED
        const fontsize = to_i(radius * 0.8), half = fontsize / 2
        const y_upper = y - half, y_lower = y + half
        const [winrate_text, visits_text] = suggest_texts(suggest)
        const score_text = score_bar_p() && f2s(suggest.score_without_komi)
        g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillStyle = suggest.winrate_order === 0 ? champ_color : lizzie_text_color
        fill_text(g, fontsize, score_text || winrate_text, x, y_upper, max_width)
        g.fillStyle = suggest.order === 0 ? champ_color : lizzie_text_color
        fill_text(g, fontsize, visits_text, x, y_lower, max_width)
        g.restore()
    }
}

function draw_suggest_0visits(h, xy, radius, g) {
    const limit_order = 4, size = (1 + log10(h.data.prior) / limit_order)
    if (size <= 0) {return}
    g.lineWidth = 1; g.strokeStyle = 'rgba(255,0,0,0.2)'
    circle(xy, radius * size, g)
}

function draw_suggestion_order(h, [x, y], radius, color, large_font_p, g) {
    if (h.data.order >= 9) {return}
    const lizzie = R.lizzie_style
    const both_champ = (h.data.order + h.data.winrate_order === 0)
    const either_champ = (h.data.order * h.data.winrate_order === 0)
    const huge = [2, -1], large = [1.5, -0.5], normal = [1, -0.1], small = [0.8, 0.3]
    const font_modifier = large_font_p && both_champ && 'bold '
    const either = (champ, other) => both_champ ? champ : other
    const [fontsize, d] = (lizzie ? small : large_font_p ? huge : either(large, normal))
          .map(c => c * radius)
    const w = fontsize, x0 = x + d + w / 2, y0 = y - d - w / 2
    g.save()
    g.fillStyle = BLUE
    lizzie && fill_rect([x + d, y - d - w], [x + d + w, y - d], g)
    g.fillStyle = lizzie ? WHITE : either_champ ? RED : color
    g.textAlign = 'center'; g.textBaseline = 'middle'
    fill_text_with_modifier(g, font_modifier, fontsize, h.data.order + 1, x0, y0, w)
    g.restore()
}

// misc

function draw_expected_mark(h, [x, y], expected_p, radius, g) {
    const x1 = x - radius, y1 = y + radius, d = radius / 2
    g.fillStyle = xor(R.bturn, expected_p) ? BLACK : WHITE  // whose plan?
    fill_line([x1, y1 - d], [x1, y1], [x1 + d, y1], g)
    g.strokeStyle = expected_p ? EXPECTED_COLOR : UNEXPECTED_COLOR; g.lineWidth = 2
    square_around([x, y], radius, g)
}

function draw_endstate(endstate, xy, radius, g) {
    if (!truep(endstate)) {return}
    const c = (endstate >= 0) ? 64 : 255, alpha = Math.abs(endstate) * 0.7
    g.fillStyle = `rgba(${c},${c},${c},${alpha})`
    fill_square_around(xy, radius, g)
}

function draw_endstate_value(h, past_p, sign, xy, radius, g) {
    const quantized = false, ten = '10', max_width = radius * 1.5
    const {endstate, endstate_diff} = h
    if (!truep(endstate) || (past_p && !truep(endstate_diff))) {return}
    const e = endstate - (past_p ? endstate_diff * sign : 0)
    const a = Math.abs(e), v = Math.round(a * 10)
    const c = quantized ? ((v > 6) ? 2 : (v > 3) ? 1 : 0.5) : Math.sqrt(a) * 2
    g.save()
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = (e >= 0) ? '#080' : '#f0f'
    fill_text(g, radius * c, v === 10 ? ten : to_s(v), ...xy, max_width)
    g.restore()
}

function draw_endstate_diff(diff, xy, radius, g) {
    if (!diff) {return}
    const size = 0.2, [c, r, f, thicker] = diff > 0 ?
          ['#080', 1, square_around, 1.5] : ['#f0f', 1, x_shape_around, 1]
    const thick = (R.endstate_diff_interval > 5 ? 1.5 : 3) * thicker
    g.lineWidth = Math.abs(diff * thick); g.strokeStyle = c; f(xy, radius * size * r, g)
}

/////////////////////////////////////////////////
// mapping from goban to winrate bar

function draw_winrate_mapping_line(h, xy, unit, g) {
    const b_winrate = flip_maybe(fake_winrate(h.data))
    const order = h.next_move ? 0 : Math.min(h.data.order, h.data.winrate_order)
    g.lineWidth = 1.5 / (order * 2 + 1)
    g.strokeStyle = RED
    line(xy, ...mapping_line_coords(b_winrate, unit, g.canvas), g)
}

function draw_mapping_text(mapping_to_winrate_bar, margin, canvas, g) {
    const {text, subtext, at} = mapping_to_winrate_bar
    const y = canvas.height - margin / 6, fontsize = margin / 2
    // main text
    g.fillStyle = RED
    g.textAlign = at < 10 ? 'left' : at < 90 ? 'center' : 'right'
    fill_text(g, fontsize, text, canvas.width * at / 100, y)
    // subtext
    const [sub_at, sub_align] = at > 50 ? [0, 'left'] : [100, 'right']
    g.fillStyle = 'rgba(255,0,0,0.5)'; g.textAlign = sub_align
    fill_text(g, fontsize, subtext, canvas.width * sub_at / 100, y)
}

function draw_mapping_tics(unit, canvas, g) {
    // mini winrate bar
    const boundary = b_winrate()
    const draw = (c, l, r) => {g.fillStyle = c; fill_rect(l, r, g)}
    if (truep(boundary)) {
        const [[b0, b1], [m0, m1], [w0, w1]] =
              [0, boundary, 100].map(wr => mapping_line_coords(wr, unit, canvas))
        draw(...(R.bturn ? [BLACK, b0, m1] : [WHITE, m0, w1]))
    }
    // tics
    seq(9, 1).forEach(k => {
        const r = k * 10
        g.strokeStyle = (R.bturn && r < boundary) ? WHITE : BLACK
        g.lineWidth = (r === 50 ? 3 : 1)
        line(...mapping_line_coords(r, unit, canvas), g)
    })
}

function mapping_text(suggest) {
    const [winrate_text, visits_text, prior_text, score_text, score_stdev_text]
          = suggest_texts(suggest) || []
    const v = visits_text ? ` (${visits_text})` : ''
    const text = winrate_text && `${winrate_text}${v}`
    const pr = ` prior = ${prior_text} `
    const sc = score_text ? ` score = ${score_text}(±${score_stdev_text}) ` : ''
    const subtext = text && (pr + sc)
    const at = flip_maybe(fake_winrate(suggest))
    return text && {text, subtext, at}
}

function mapping_line_coords(b_winrate, unit, canvas) {
    const x1 = canvas.width * b_winrate / 100, y1 = canvas.height, d = unit * 0.3
    return [[x1, y1 - d], [x1, y1]]
}

/////////////////////////////////////////////////
// winrate bar

let winrate_bar_prev = 50

function draw_winrate_bar(canvas, large_bar, pale_text_p) {
    const w = canvas.width, h = canvas.height, g = canvas.getContext("2d")
    const score_p = score_bar_p(), tics = score_p ? 19 : 9
    const xfor = percent => w * percent / 100
    const vline = percent => {const x = xfor(percent); line([x, 0], [x, h], g)}
    const z = R.winrate_history[R.move_count] || {}
    const b_wr0 = fake_winrate_for(z.r, z.score_without_komi, true)
    const b_wr = truep(b_wr0) ? b_wr0 : winrate_bar_prev
    const komi_wr = score_p && fake_winrate_for(0.5, R.komi, true)
    const prev_score = score_p && origin_score(), ready = !empty(R.suggest)
    winrate_bar_prev = b_wr
    if (R.pausing && !truep(b_wr0)) {
        draw_winrate_bar_unavailable(w, h, g)
        draw_winrate_bar_tics(0, null, tics, w, h, vline, g)
        return
    }
    draw_winrate_bar_areas(b_wr, w, h, xfor, vline, g)
    draw_winrate_bar_tics(b_wr, komi_wr, tics, w, h, vline, g)
    if (ready) {
        large_bar && draw_winrate_bar_horizontal_lines(w, h, g)
        draw_winrate_bar_last_move_eval(b_wr, prev_score, h, xfor, vline, g)
        R.winrate_trail && draw_winrate_trail(canvas)
        draw_winrate_bar_suggestions(w, h, xfor, vline, large_bar, g)
    }
    draw_winrate_bar_text(b_wr, prev_score, w, h, pale_text_p, !ready, g)
}

function draw_winrate_bar_text(b_wr, prev_score, w, h, pale_text_p, score_only_p, g) {
    if (!truep(b_wr)) {return}
    const scorep = score_bar_p(), b_sign = R.bturn ? 1 : -1
    const eval = scorep ? - (R.score_without_komi - prev_score) * b_sign
          : - (b_wr - origin_b_winrate()) * b_sign
    const visits = R.max_visits && kilo_str(R.max_visits)
    const fontsize = Math.min(h * 0.5, w * 0.04)
    const [wr_color, vis_color] = pale_text_p ?
          ['rgba(0,192,0,0.3)', 'rgba(160,160,160,0.3)'] :
          [GREEN, WINRATE_TRAIL_COLOR]
    g.save()
    g.textBaseline = 'middle'
    const write = (text, x, y_rel) =>
          fill_text(g, fontsize, text, x, fontsize * (y_rel || 0.5))
    const score_str = wr => (wr % 10 === 0) ? wr : ''
    const f = (wr_text, x, align, myturn) => {
        const cond = (pred, s) => (pred ? ` ${s} ` : '')
        const vis = cond(visits, visits)
        const ev = cond(truep(eval), `(${eval > 0 ? '+' : ''}${f2s(eval)})`)
        const win = cond(true, wr_text)
        g.textAlign = align; g.fillStyle = wr_color; write(win, x)
        myturn && (g.fillStyle = vis_color); write(myturn ? vis : ev, x, 1.5)
    }
    const {lower, l_quarter, center, u_quarter, upper} = score_bar_fitter.range()
    const [left, right] = scorep ? [lower, upper].map(score_str) :
          [b_wr, 100 - b_wr].map(wr => f2s(wr) + '%')
    !score_only_p && (f(left, 0, 'left', R.bturn), f(right, w, 'right', !R.bturn))
    if (scorep) {
        g.textAlign = 'center'; g.fillStyle = wr_color
        const tics = [[l_quarter, 0.25], [center, 0.5], [u_quarter, 0.75]]
        tics.forEach(([wr, rel_x]) => write(score_str(wr), w * rel_x))
    }
    g.restore()
}

function draw_winrate_bar_unavailable(w, h, g) {
    g.fillStyle = "#888"; fill_rect([0, 0], [w, h], g)
}

function draw_winrate_bar_areas(b_wr, w, h, xfor, vline, g) {
    const wrx = xfor(b_wr)
    g.lineWidth = 1
    // black area
    g.fillStyle = R.bturn ? BLACK : "#000"
    g.strokeStyle = WHITE; edged_fill_rect([0, 0], [wrx, h], g)
    // white area
    g.fillStyle = R.bturn ? "#fff" : WHITE
    g.strokeStyle = BLACK; edged_fill_rect([wrx, 0], [w, h], g)
}

function draw_winrate_bar_horizontal_lines(w, h, g) {
    const vs = tics_until(R.max_visits)
    g.strokeStyle = WINRATE_TRAIL_COLOR; g.lineWidth = 1
    winrate_bar_ys(vs, w, h).map(y => line([0, y], [w, y], g))
}

function draw_winrate_bar_tics(b_wr, komi_wr, tics, w, h, vline, g) {
    const thick = [25, 50, 75], komi_p = truep(komi_wr)
    const vl = (wr, light, dark) => {
        g.strokeStyle = (wr < b_wr) ? light : (dark || light); vline(wr)
    }
    seq(tics, 1).forEach(i => {
        const r = 100 * i / (tics + 1), center_p = (r === 50) && !komi_p
        g.lineWidth = center_p ? 5 : thick.includes(Math.round(r)) ? 3 : 1
        vl(r, ...(center_p ? [ORANGE] : [WHITE, BLACK]))
    })
    if (!komi_p) {return}
    // indicate komi
    const [too_black, too_white] = [(komi_wr <= 0), (komi_wr >= 100)], unit = w / tics
    const komi_line = () => {g.lineWidth = 5; vl(komi_wr, ORANGE)}
    const fade = (x0, x1) => {
        const transparent_orange = "rgba(252,141,73,0)"
        g.fillStyle = side_gradation(x0, x1, ORANGE, transparent_orange, g)
        fill_rect([x0, 0], [x1, h], g)
    }
    too_black ? fade(0, unit) : too_white ? fade(w, w - unit) : komi_line()
}


function draw_winrate_bar_komi(komi, h, xfor, g) {
    const dummy = 0
    const [x1, x2] = [-0.5, 0.5].map(d => xfor(fake_winrate_for(dummy, komi + d, true)))
    g.lineWidth = 1; g.strokeStyle = '#888'
    line([x1, 0], [x2, h], g)
}


function draw_winrate_bar_last_move_eval(b_wr, prev_score, h, xfor, vline, g) {
    const obw = origin_b_winrate(), dummy = 0
    const prev_b_wr = score_bar_p() ?
          fake_winrate_for(dummy, prev_score, true) : obw
    if (!truep(obw) || (b_wr === prev_b_wr)) {return}
    const [x1, x2] = num_sort([b_wr, prev_b_wr].map(xfor))
    const last_gain = - (b_wr - prev_b_wr) * (R.bturn ? 1 : -1)
    if (!truep(last_gain)) {return}
    const [stroke, fill] = (last_gain >= 0 ? [GREEN, PALE_GREEN] : [RED, PALE_RED])
    const lw = g.lineWidth = 3; g.strokeStyle = stroke; g.fillStyle = fill
    edged_fill_rect([x1, lw / 2], [x2, h - lw / 2], g)
}

/////////////////////////////////////////////////
// suggested moves on winrate bar

// draw

function draw_winrate_bar_suggestions(w, h, xfor, vline, large_bar, g) {
    g.lineWidth = 1
    const max_radius = Math.min(h, w * 0.05)
    const prev_color = 'rgba(64,128,255,0.8)'
    R.suggest.filter(s => s.visits > 0).forEach(s => {
        const {edge_color, fan_color, vline_color, aura_color,
               target_p, draw_order_p, winrate} = winrate_bar_suggest_prop(s)
        draw_winrate_bar_fan(s, w, h, edge_color, fan_color, aura_color,
                             target_p, large_bar, g)
        draw_order_p && large_bar && draw_winrate_bar_order(s, w, h, g)
        if (vline_color) {
            g.lineWidth = 3; g.strokeStyle = vline_color; vline(flip_maybe(winrate))
        }
    })
    R.previous_suggest &&
        draw_winrate_bar_fan(R.previous_suggest, w, h,
                             prev_color, TRANSPARENT, null,
                             false, large_bar, g)
}

function draw_winrate_bar_fan(s, w, h, stroke, fill, aura_color,
                              force_puct_p, large_bar, g) {
    const bturn = s.bturn === undefined ? R.bturn : s.bturn
    const plot_params = winrate_bar_xy(s, w, h, true, bturn)
    const [x, y, r, max_radius, x_puct, y_puct] = plot_params
    const half_center_angle = 60 / 2, max_slant = large_bar ? 45 : 30
    const direction =
          (bturn ? 180 : 0) + winrate_trail_rising(s) * max_slant * (bturn ? -1 : 1)
    const degs = [direction - half_center_angle, direction + half_center_angle]
    const draw_fan = () => {
        g.lineWidth = 1; [g.strokeStyle, g.fillStyle] = [stroke, fill]
        edged_fill_fan([x, y], r, degs, g)
    }
    draw_with_aura(draw_fan,
                   s, h, plot_params, large_bar && aura_color, force_puct_p, g)
}

function draw_with_aura(proc,
                        s, h, [x, y, r, max_radius, x_puct, y_puct, x_lcb],
                        aura_color, force_puct_p, g) {
    if (!aura_color) {proc(); return}
    const searched = winrate_trail_searched(s), rel_dy = (y - y_puct) / h
    const draw_puct_p = force_puct_p || s.visits_order === 0 ||
          (Math.abs(rel_dy) > 0.05 && s.visits > R.max_visits * 0.3) ||
          (rel_dy > 0.2 && s.visits > R.max_visits * 0.05)
    const draw_lcb_p = force_puct_p || s.visits > R.max_visits * 0.1 ||
          (s.order < 3 && s.winrate - s.lcb < 0.3)
    // circle
    g.strokeStyle = g.fillStyle = aura_color
    fill_circle([x, y], max_radius * 0.15 * Math.sqrt(searched), g)
    // proc
    g.save(); proc(); g.restore()
    // line
    g.lineWidth = 2
    draw_puct_p && !R.is_katago && line([x, y], [x_puct, clip(y_puct, 0, h)], g)
    draw_lcb_p && line([x, y], [x_lcb, y], g)
}

function draw_winrate_bar_order(s, w, h, g) {
    const fontsize = w * 0.03, [x, y] = winrate_bar_xy(s, w, h)
    const modified_fontsize = winrate_bar_order_set_style(s, fontsize, g)
    g.save()
    g.textAlign = R.bturn ? 'left' : 'right'; g.textBaseline = 'middle'
    fill_text(g, modified_fontsize, ` ${s.order + 1} `, x, y)
    g.restore()
}

// style

function winrate_bar_suggest_prop(s) {
    // const
    const next_color = '#48f'
    const next_vline_color = 'rgba(64,128,255,0.5)'
    const target_vline_color = 'rgba(255,64,64,0.5)'
    const normal_aura_color = 'rgba(235,148,0,0.8)'
    const target_aura_color = 'rgba(0,192,0,0.8)'
    // main
    const {move} = s, winrate = fake_winrate(s)
    const edge_color = target_move ? 'rgba(128,128,128,0.5)' : '#888'
    const target_p = (move === target_move), next_p = is_next_move(move)
    const alpha = target_p ? 1.0 : target_move ? 0.3 : 0.8
    const {fill} = suggest_color(s, alpha)
    const fan_color = (!target_move && next_p) ? next_color : fill
    const vline_color = target_p ? target_vline_color :
          next_p ? next_vline_color : null
    const aura_color = target_p ? target_aura_color : normal_aura_color
    const major = s.visits >= R.max_visits * 0.3 || s.prior >= 0.3 ||
          s.order < 3 || s.winrate_order < 3 || target_p || next_p
    const eliminated = target_move && !target_p
    const draw_order_p = major && !eliminated
    return {edge_color, fan_color, vline_color, aura_color, alpha,
            target_p, draw_order_p, next_p, winrate}
}

function suggest_color(suggest, alpha) {
    const hue = winrate_color_hue(suggest.winrate, suggest.score_without_komi)
    const alpha_emphasis = emph => {
        const max_alpha = 0.5, visits_ratio = suggest.visits / (R.visits + 1)
        return max_alpha * visits_ratio ** (1 - emph)
    }
    const hsl_e = (h, s, l, emph) => hsla(h, s, l, alpha || alpha_emphasis(emph))
    const stroke = hsl_e(hue, 100, 20, 0.85), fill = hsl_e(hue, 100, 50, 0.4)
    const lizzie_text_color = 'rgba(0,0,0,0.7)'
    return {stroke, fill, lizzie_text_color}
}

function winrate_color_hue(winrate, score) {
    const cyan_hue = 180, green_hue = 120, yellow_hue = 60, red_hue = 0
    const unit_delta_hue = green_hue - yellow_hue
    const unit_delta_winrate = 5, unit_delta_score = 5
    // winrate gain
    const wr0 = flip_maybe(origin_b_winrate())
    const delta_by_winrate = (winrate - wr0) / unit_delta_winrate
    // score gain
    const s0 = origin_score()
    const delta_by_score_maybe = truep(score) && truep(s0) &&
          (score - s0) * (R.bturn ? 1 : -1) / unit_delta_score
    const delta_by_score = delta_by_score_maybe || delta_by_winrate
    // color for gain
    const delta_hue = (delta_by_winrate + delta_by_score) / 2 * unit_delta_hue
    return to_i(clip(yellow_hue + delta_hue, red_hue, cyan_hue))
}

function origin_b_winrate() {return origin_gen(b_winrate)}
function origin_score() {
    const prev_score = nth_prev => winrate_history_ref('score_without_komi', nth_prev)
    return origin_gen(prev_score)
}
function origin_gen(get_prev) {return [1, 2, 0].map(get_prev).find(truep)}

function winrate_bar_max_radius(w, h) {return Math.min(h * 1, w * 0.1)}

function winrate_bar_order_set_style(s, fontsize, g) {
    const firstp = (s.order === 0)
    g.fillStyle = firstp ? WINRATE_BAR_FIRST_ORDER_COLOR : WINRATE_BAR_ORDER_COLOR
    return fontsize * (firstp ? 1.5 : 1)
}

// calc

function winrate_bar_xy(suggest, w, h, supplementary, bturn) {
    const real_wr = suggest.winrate, max_radius = winrate_bar_max_radius(w, h)
    const wr = fake_winrate(suggest, bturn)
    const x_for = winrate => w * flip_maybe(winrate, bturn) / 100
    const y_for = visits => winrate_bar_y(visits, w, h, max_radius)
    const x = x_for(wr), y = y_for(suggest.visits)
    if (!supplementary) {return [x, y]}
    // omit PUCT and LCB for score_bar
    const maybe_x_for = winrate => x_for(score_bar_p() ? wr : winrate)
    const [puct, equilibrium_visits] = puct_info(suggest)
    return [x, y, max_radius * Math.sqrt(suggest.prior), max_radius,
            maybe_x_for(wr + puct), y_for(equilibrium_visits), maybe_x_for(suggest.lcb)]
}

function winrate_bar_y(visits, w, h, max_radius) {
    const mr = max_radius || winrate_bar_max_radius(w, h)
    const hmin = mr * 0.15, hmax = h - mr * 0.1
    const relative_visits = visits / R.max_visits
    // relative_visits > 1 can happen for R.previous_suggest
    return clip(hmin * relative_visits + hmax * (1 - relative_visits), 0, h)
}

function winrate_bar_ys(vs, w, h) {
    const max_radius = winrate_bar_max_radius(w, h)
    return vs.map(v => winrate_bar_y(v, w, h, max_radius))
}

function puct_info(suggest) {
    const s0 = R.suggest[0]; if (!s0) {return []}
    // (ref.) UCTNode.cpp and GTP.cpp in Leela Zero source
    // fixme: should check --puct option etc. of leelaz
    const cfg_puct = 0.5, cfg_logpuct = 0.015, cfg_logconst = 1.7
    const parentvisits = R.visits, psa = suggest.prior, denom = 1 + suggest.visits
    const numerator = Math.sqrt(parentvisits *
                                Math.log(cfg_logpuct * parentvisits + cfg_logconst))
    const puct = cfg_puct * psa * (numerator / denom) * 100
    // wr0 - wr = cfg_puct * (numerator * (psa/denom - psa0/denom0)) * 100
    // ==> psa/denom = psa0/denom0 + (wr0 - wr) / (cfg_puct * numerator * 100)
    const psa_per_denom = s0.prior / (1 + s0.visits) +
          (s0.winrate - suggest.winrate) / (cfg_puct * numerator * 100)
    const equilibrium_visits = psa / clip(psa_per_denom, 1e-10) - 1
    return [puct, equilibrium_visits]
}

/////////////////////////////////////////////////
// score bar

function score_bar_p() {return R.score_bar && R.is_katago}

function make_center_fitter(step) {
    let center = 0
    const update_center = sc => {
        const d = sc - center, out = Math.abs(d) > step
        out && ((center = center + step * Math.sign(d)), update_center(sc))
    }
    const range = () => ({
        lower: center - step * 2, l_quarter: center - step,
        center, u_quarter: center + step, upper: center + step * 2
    })
    return {update_center, range}
}
const score_bar_fitter = make_center_fitter(5)

// convert score to "winrate of corresponding position on winrate bar"
// to cheat drawing functions in score_bar mode
function fake_winrate(suggest, bturn) {
    return fake_winrate_for(suggest.winrate, suggest.score_without_komi, bturn)
}
function fake_winrate_for(winrate, score_without_komi, bturn) {
    if (!score_bar_p()) {return winrate}
    score_bar_fitter.update_center(R.score_without_komi)
    const {lower, upper} = score_bar_fitter.range()
    const fake_b_wr = 100 * (score_without_komi - lower) / (upper - lower)
    return clip(flip_maybe(fake_b_wr, bturn), 0, 100)
}

/////////////////////////////////////////////////
// winrate graph

const zone_indicator_height_percent = 3

function draw_winrate_graph(canvas, show_until, handle_mouse_on_winrate_graph) {
    const w = canvas.width, h = canvas.height, g = canvas.getContext("2d")
    const xmargin = w * 0.02, fontsize = to_i(w * 0.04)
    const smax = Math.max(R.history_length, 1), rmin = - zone_indicator_height_percent
    // s = move_count, r = winrate
    const [sr2coord, coord2sr] =
          uv2coord_translator_pair(canvas, [0, smax], [100, rmin], xmargin, 0)
    const overlay = graph_overlay_canvas.getContext("2d")
    clear_canvas(graph_overlay_canvas)
    show_until && draw_winrate_graph_show_until(show_until, w, h, fontsize, sr2coord,
                                                overlay)
    !show_until && draw_winrate_graph_future(w, sr2coord, overlay)
    if (R.busy || show_until) {return}
    const draw_score = score_drawer(w, sr2coord, g)
    clear_canvas(canvas, BLACK, g)
    draw_winrate_graph_frame(w, h, sr2coord, g)
    draw_score('komi')
    draw_winrate_graph_ko_fight(sr2coord, g)
    draw_winrate_graph_unsafe_stones(sr2coord, g)
    draw_winrate_graph_ambiguity(sr2coord, g)
    draw_winrate_graph_zone(sr2coord, g)
    draw_winrate_graph_tag(fontsize, sr2coord, g)
    draw_winrate_graph_curve(sr2coord, g)
    draw_score('score')
    // mouse events
    handle_mouse_on_winrate_graph(canvas, coord2sr)
}

function draw_winrate_graph_frame(w, h, sr2coord, g) {
    const tics = 9, xtics = 10, xtics_delta = 50
    const s2x = s => sr2coord(s, 0)[0], r2y = r => sr2coord(0, r)[1]
    // horizontal / vertical lines (tics)
    g.strokeStyle = DARK_GRAY; g.fillStyle = DARK_GRAY; g.lineWidth = 1
    seq(tics, 1).forEach(i => {
        const y = r2y(100 * i / (tics + 1)); line([0, y], [w, y], g)
    })
    seq(xtics, 1).forEach(k => {
        const x = s2x(k * xtics_delta); line([x, 0], [x, h], g)
    })
    // // frame
    // g.strokeStyle = GRAY; g.fillStyle = GRAY; g.lineWidth = 1
    // rect([0, 0], [w, h], g)
    // 50% line
    g.strokeStyle = GRAY; g.fillStyle = GRAY; g.lineWidth = 1
    const y50 = r2y(50); line([0, y50], [w, y50], g)
    // bottom space for zone indicator
    g.fillStyle = DARK_GRAY; fill_rect([0, h], [w, r2y(0)], g)
}

function draw_winrate_graph_show_until(show_until, w, h, fontsize, sr2coord, g) {
    // area
    const [s0, s1] = num_sort([show_until, R.move_count])
    const xy0 = sr2coord(s0, 100), xy1 = sr2coord(s1, 0)
    g.strokeStyle = g.fillStyle = 'rgba(128,128,0,0.3)'; g.lineWidth = 1
    edged_fill_rect(xy0, xy1, g)
    // move number
    const delta = R.move_count - show_until
    const [x, y] = sr2coord(show_until, 0), margin = fontsize * 2
    const left_limit = (delta < 0 ? w - margin : margin)
    g.save()
    g.textAlign = x < left_limit ? 'left' : 'right'; g.textBaseline = 'bottom'
    g.fillStyle = 'rgba(255,255,0,0.7)'
    fill_text(g, fontsize, ' ' + show_until + ' ', x, y)
    g.restore()
}

function draw_winrate_graph_future(w, sr2coord, g) {
    const [x, y] = sr2coord(R.move_count, 50), [_, y_base] = sr2coord(0, 0)
    const paint = (partial, l_alpha, r_alpha, y0, y1) => {
        const c = a => `rgba(255,255,255,${a})`
        const grad = side_gradation(x, (1 - partial) * x + partial * w,
                                    c(l_alpha), c(r_alpha), g)
        g.fillStyle = grad; fill_rect([x, y0], [w, y1], g)
    }
    const alpha = 0.2
    paint(0.5, alpha, 0, 0, y); paint(1, alpha, alpha, y, y_base)
}

function draw_winrate_graph_curve(sr2coord, g) {
    const [whs, rest] = R.winrate_history_set
    const style_for = k => whs.length <= 1 ? null : k === 0 ? "#0c0" : '#c0c'
    const draw1 = (a, style) => draw_winrate_graph_curve_for(a, style, sr2coord, g)
    rest.forEach(a => draw1(a, 'rest'))
    whs.forEach((a, which_engine) => draw1(a, style_for(which_engine)))
}

function draw_winrate_graph_curve_for(winrate_history, style, sr2coord, g) {
    let prev = null, cur = null
    const draw_predict = (r, s, p) => {
        g.strokeStyle = YELLOW; g.lineWidth = 1; line(sr2coord(s, r), sr2coord(s, p), g)
    }
    winrate_history.forEach((h, s) => {
        if (!truep(h.r)) {return}
        const thin = (style === 'rest')
        truep(h.predict) && !thin && draw_predict(h.r, s, h.predict)
        g.strokeStyle = thin ? PALE_BLUE : style ? style :
            isNaN(h.move_eval) ? GRAY : h.pass ? PALE_BLUE :
            (h.move_eval < 0) ? "#c00" : (s > 1 && !truep(h.predict)) ? "#ff0" : "#0c0"
        g.lineWidth = (thin ? 1 : s <= R.move_count ? 3 : 1)
        cur = sr2coord(s, h.r); prev && line(prev, cur, g); prev = cur
    })
}

function draw_winrate_graph_tag(fontsize, sr2coord, g) {
    R.winrate_history.forEach((h, s) => {
        if (!h.tag) {return}
        const [x, ymax] = sr2coord(s, 0)
        const [yt, yl] = (h.r < 50 ? [0.05, 0.1] : [0.95, 0.9]).map(c => ymax * c)
        g.save()
        g.textAlign = 'center'; g.textBaseline = 'middle'
        g.strokeStyle = BLUE; g.lineWidth = 1; line([x, yl], [x, ymax / 2], g)
        g.fillStyle = BLUE; fill_text(g, fontsize, h.tag, x, yt)
        g.restore()
    })
}

// additional plots

function score_drawer(w, sr2coord, g) {
    const scores = winrate_history_values_of('score_without_komi')
    const max_score = Math.max(...scores.filter(truep).map(Math.abs))
    if (max_score === - Infinity) {return do_nothing}
    const color = alpha => `rgba(235,148,0,${alpha})`
    const scale = max_score < 45 ? 1 : max_score < 95 ? 0.5 : 0.2
    const to_r = score => 50 + score * scale
    const draw_komi = () => {
        const [dummy, ky] = sr2coord(R.move_count, to_r(R.komi))
        g.lineWidth = 1; g.strokeStyle = color(0.6)
        line([0, ky], [w, ky], g)
    }
    const plotter = (x, y, s, g) => {
        const diff_target_p = R.endstate_diff_interval > 5 &&
              (s === R.move_count - R.endstate_diff_interval)
        const big_p = (s === R.move_count) || diff_target_p
        const [radius, alpha] = big_p ? [4, 0.8] : [2.5, 0.6]
        g.fillStyle = color(alpha)
        fill_circle([x, y], radius, g)
    }
    const draw_score = () => {
        draw_winrate_graph_history(scores, to_r, plotter, sr2coord, g)
    }
    return command => ({score: draw_score, komi: draw_komi})[command]()
}

function draw_winrate_graph_ko_fight(sr2coord, g) {
    const radius = 5, alpha = 0.7
    const plot = (z, s) => {
        const [x, y] = sr2coord(s, 100), cy = y + radius * (z.is_black ? 1 : 2.5)
        g.fillStyle = zone_color_for_move(z.move, alpha)
        fill_circle([x, cy], radius, g)
    }
    R.move_history.forEach((z, s) => z.ko_fight && plot(z, s))
}

function draw_winrate_graph_unsafe_stones(sr2coord, g) {
    const radius = 2
    const plot = ({black, white}, s) => {plot1(black, s, true); plot1(white, s, false)}
    const plot1 = (count, s, is_black) => {
        const [x, y] = sr2coord(s, count)
        const f = is_black ? square_around : fill_square_around
        f([x, y], radius, g)
    }
    g.lineWidth = 1; g.strokeStyle = g.fillStyle = "#666"
    R.move_history.forEach(({unsafe_stones}, s) => unsafe_stones && plot(unsafe_stones, s))
}

function draw_winrate_graph_ambiguity(sr2coord, g) {
    const radius = 2
    g.fillStyle = "rgba(255,0,0,0.3)"
    const plot = (ambiguity, s) => {
        if (!truep(ambiguity)) {return}
        const [x, y] = sr2coord(s, 100 - ambiguity)
        fill_square_around([x, y], radius, g)
    }
    R.move_history.forEach((z, s) => plot(z.ambiguity, s))
}

function draw_winrate_graph_zone(sr2coord, g) {
    const half = 0.6  // > 0.5 for avoiding gaps in spectrum bar
    const rmin = - zone_indicator_height_percent
    R.move_history.forEach((z, s) => {
        g.fillStyle = zone_color_for_move(z.move)
        fill_rect(sr2coord(s - half, 0), sr2coord(s + half, rmin), g)
    })
}

function draw_winrate_graph_history(ary, to_r, plotter, sr2coord, g) {
    const f = (val, s) => truep(val) && plotter(...sr2coord(s, to_r(val)), s, g)
    ary.forEach(f)
}

function winrate_history_values_of(key) {return R.winrate_history.map(h => h[key])}

/////////////////////////////////////////////////
// winrate trail

const winrate_trail_max_length = 50
const winrate_trail_max_suggestions = 10
const winrate_trail_limit_relative_visits = 0.3
const winrate_trail_engine_checker = change_detector()
let winrate_trail = {}, winrate_trail_move_count = 0, winrate_trail_visits = 0

function update_winrate_trail() {
    const total_visits_increase = R.visits - winrate_trail_visits;
    // check visits for detecting restart of leelaz
    (winrate_trail_move_count !== R.move_count ||
     (R.visits && winrate_trail_visits > R.visits) ||
     (R.engine_id && winrate_trail_engine_checker.is_changed(R.engine_id))) &&
        (winrate_trail = {});
    [winrate_trail_move_count, winrate_trail_visits] = [R.move_count, R.visits]
    R.suggest.slice(0, winrate_trail_max_suggestions).forEach(s => {
        const move = s.move, wt = winrate_trail
        const trail = wt[move] || (wt[move] = []), len = trail.length
        const relative_visits = s.visits / R.max_visits, total_visits = R.visits
        merge(s, {relative_visits, total_visits})
        len > 0 && (s.searched = (s.visits - trail[0].visits) / total_visits_increase)
        s.searched === 0 && trail.shift()
        trail.unshift(s); thin_winrate_trail(trail)
    })
}

function thin_winrate_trail(trail) {
    const len = trail.length
    if (len <= winrate_trail_max_length) {return}
    const distance = (k1, k2) => {
        const t1 = trail[k1], t2 = trail[k2], diff = key => Math.abs(t1[key] - t2[key])
        return diff('visits')
    }
    const ideal_interval = distance(0, len - 1) / (winrate_trail_max_length - 1)
    const interval_around = (_, k) => (1 < k && k < len - 1) ?  // except 0, 1, and last
          distance(k - 1, k + 1) : Infinity
    const min_index = a => a.indexOf(Math.min(...a))
    const victim = distance(1, 2) < ideal_interval ? 1 :
          min_index(trail.map(interval_around))
    victim >= 0 && trail.splice(victim, 1)
}

function draw_winrate_trail(canvas) {
    const w = canvas.width, h = canvas.height, g = canvas.getContext("2d")
    const xy_for = s => winrate_bar_xy(s, w, h)
    const limit_visits = R.max_visits * winrate_trail_limit_relative_visits
    g.lineWidth = 2
    g.strokeStyle = target_move ? 'rgba(0,192,255,0.8)' : WINRATE_TRAIL_COLOR
    each_key_value(winrate_trail, (move, a, count) => {
        const ok = target_move ? (move === target_move) : (a[0].visits >= limit_visits)
        ok && line(...a.map(xy_for), g)
        // ok && a.map(xy_for).map(xy => circle(xy, 3, g))  // for debug
    })
}

function winrate_trail_rising(suggest) {
    const unit = 0.005, max_delta = 5, a = winrate_trail[suggest.move] || []
    const delta = clip(a.length - 1, 0, max_delta)
    return (delta < 1) ? 0 :
        clip((a[0].relative_visits - a[delta].relative_visits) / (delta * unit), -1, 1)
}

function winrate_trail_searched(suggest) {
    // suggest.searched > 1 can happen for some reason
    return clip(suggest.searched || 0, 0, 1)
}

/////////////////////////////////////////////////
// visits trail

function draw_visits_trail(canvas) {
    const w = canvas.width, h = canvas.height, g = canvas.getContext("2d")
    const fontsize = h / 10, top_margin = 3
    const v2x = v => v / R.visits * w
    const v2y = v => (1 - v / R.max_visits) * (h - top_margin) + top_margin
    const xy_for = z => [v2x(z.total_visits), v2y(z.visits)]
    canvas.onmousedown = canvas.onmousemove = canvas.onmouseup = e => {}
    g.fillStyle = BLACK; fill_rect([0, 0], [w, h], g)
    if (!R.visits || !R.max_visits) {return}
    draw_visits_trail_grid(fontsize, w, h, v2x, v2y, g)
    R.suggest.forEach(s => draw_visits_trail_curve(s, fontsize, h, xy_for, g))
}

function draw_visits_trail_grid(fontsize, w, h, v2x, v2y, g) {
    const kilo = (v, x, y) => fill_text(g, fontsize, ' ' + kilo_str(v).replace('.0', ''), x, y)
    g.save()
    g.lineWidth = 1
    g.strokeStyle = g.fillStyle = WINRATE_TRAIL_COLOR; g.textAlign = 'left'
    g.textBaseline = 'top'
    tics_until(R.visits).forEach(v => {
        if (!v) {return}; const x = v2x(v); line([x, 0], [x, h], g); kilo(v, x, 0)
    })
    g.textBaseline = 'bottom'
    tics_until(R.max_visits).forEach(v => {
        if (!v) {return}; const y = v2y(v); line([0, y], [w, y], g); kilo(v, 0, y)
    })
    g.restore()
}

function draw_visits_trail_curve(s, fontsize, h, xy_for, g) {
    const {move} = s, a = winrate_trail[move]
    if (!a) {return}
    const {alpha, target_p, draw_order_p, next_p} = winrate_bar_suggest_prop(s)
    const xy = a.map(xy_for)
    a.forEach((fake_suggest, k) => {  // only use fake_suggest.winrate
        if (k === 0) {return}
        g.strokeStyle = g.fillStyle = suggest_color(fake_suggest, alpha).fill
        g.lineWidth = (a[k].order === 0 && a[k-1].order === 0) ? 8 : 2
        line(xy[k], xy[k - 1], g)
        next_p && !target_p && fill_circle(xy[k], 4, g)
    })
    draw_order_p && draw_visits_trail_order(s, a, target_p, fontsize, h, xy_for, g)
}

function draw_visits_trail_order(s, a, forcep, fontsize, h, xy_for, g) {
    const [x, y] = xy_for(a[0]), low = y > 0.8 * h, ord = s.order + 1
    if (low && !forcep) {return}
    g.save()
    g.textAlign = 'right'; g.textBaseline = low ? 'bottom' : 'top'
    const modified_fontsize = winrate_bar_order_set_style(s, fontsize, g)
    fill_text(g, modified_fontsize, ord === 1 ? '1' : `${ord} `, x, y)
    g.restore()
}

/////////////////////////////////////////////////
// zone color

function draw_zone_color_chart(canvas) {
    const {g, idx2coord, half_unit} = goban_params(canvas)
    clear_canvas(canvas, TRANSPARENT, g)
    seq(board_size()).forEach(i => seq(board_size()).forEach(j => {
        const xy = idx2coord(i, j)
        g.fillStyle = zone_color(i, j); fill_square_around(xy, half_unit, g)
    }))
}

function zone_color(i, j, alpha) {
    if (i < 0 || j < 0) {return TRANSPARENT}
    const mid = (board_size() - 1) / 2
    const direction = (Math.atan2(i - mid, j - mid) / Math.PI + 1) * 180
    const height = 1 - Math.max(...[i, j].map(k => Math.abs(k - mid))) / mid
    return hsla((direction + 270) % 360, 70, height * 50 + 50, alpha)
}

function zone_color_for_move(move, alpha) {return zone_color(...move2idx(move || ''), alpha)}

/////////////////////////////////////////////////
// graphics

function clear_canvas(canvas, bg_color, g) {
    canvas.style.background = bg_color || TRANSPARENT;
    (g || canvas.getContext("2d")).clearRect(0, 0, canvas.width, canvas.height)
}

function drawers_trio(gen) {
    const edged = (...a) => {gen(...a); last(a).stroke()}
    const filled = (...a) => {gen(...a); last(a).fill()}
    const both = (...a) => {filled(...a); edged(...a)}
    return [edged, filled, both]
}

function line_gen(...args) {
    // usage: line([x0, y0], [x1, y1], ..., [xn, yn], g)
    const g = args.pop(), [[x0, y0], ...xys] = args
    g.beginPath(); g.moveTo(x0, y0); xys.forEach(xy => g.lineTo(...xy))
}
function rect_gen([x0, y0], [x1, y1], g) {g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0)}
function circle_gen([x, y], r, g) {g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI)}
function fan_gen([x, y], r, [deg1, deg2], g) {
    g.beginPath(); g.moveTo(x, y)
    g.arc(x, y, r, deg1 * Math.PI / 180, deg2 * Math.PI / 180); g.closePath()
}
function square_around_gen([x, y], radius, g) {
    rect_gen([x - radius, y - radius], [x + radius, y + radius], g)
}
function triangle_around_gen([x, y], half_width, g) {
    // u = (height / 3 of regular triangle)
    const u = half_width / Math.sqrt(3), top = y - u * 2, bottom = y + u
    line_gen([x, top], [x - half_width, bottom], [x + half_width, bottom], g)
    g.closePath()
}

const [line, fill_line, edged_fill_line] = drawers_trio(line_gen)
const [rect, fill_rect, edged_fill_rect] = drawers_trio(rect_gen)
const [circle, fill_circle, edged_fill_circle] = drawers_trio(circle_gen)
const [fan, fill_fan, edged_fill_fan] = drawers_trio(fan_gen)
const [square_around, fill_square_around, edged_fill_square_around] =
      drawers_trio(square_around_gen)
const [triangle_around, fill_triangle_around, edged_fill_triangle_around] =
      drawers_trio(triangle_around_gen)

function x_shape_around([x, y], radius, g) {
    line([x - radius, y - radius], [x + radius, y + radius], g)
    line([x - radius, y + radius], [x + radius, y - radius], g)
}

// ref.
// https://github.com/kaorahi/lizgoban/issues/30
// https://stackoverflow.com/questions/53958949/createjs-canvas-text-position-changed-after-chrome-version-upgrade-from-70-to-71
// https://bugs.chromium.org/p/chromium/issues/detail?id=607053
const fix_baseline_p = process.versions.electron.match(/^[0-4]\./)
function fill_text(g, fontsize, text, x, y, max_width) {
    fill_text_with_modifier(g, null, fontsize, text, x, y, max_width)
}
function fill_text_with_modifier(g, font_modifier, fontsize, text, x, y, max_width) {
    const sink = fix_baseline_p ? 0 : 0.07
    set_font((font_modifier || '') + fontsize, g)
    g.fillText(text, x, y + fontsize * sink, max_width)
}
function set_font(fontsize, g) {g.font = '' + fontsize + 'px Arial'}

function side_gradation(x0, x1, color0, color1, g) {
    const grad = g.createLinearGradient(x0, 0, x1, 0)
    grad.addColorStop(0, color0); grad.addColorStop(1, color1)
    return grad
}

function hsla(h, s, l, alpha) {
    return 'hsla(' + h + ',' + s + '%,' + l + '%,' + (alpha === undefined ? 1 : alpha) + ')'
}

/////////////////////////////////////////////////
// utils

// stones

function copy_stones_for_display() {
    return R.stones.map(row => row.map(s => merge({}, s)))
}

function each_stone(stones, proc) {
    stones.forEach((row, i) => row.forEach((h, j) => proc(h, [i, j])))
}

function merge_stone_at(move, stone_array, stone) {
    const get_movenums = s => s.movenums || []
    const ary_or_undef = a => empty(a) ? undefined : a
    const merge_stone = (stone0, stone1) => stone0 &&
        merge(stone0, stone1,
              {movenums: ary_or_undef(flatten([stone0, stone1].map(get_movenums)))})
    // do nothing if move is pass
    const [i, j] = move2idx(move)
    i >= 0 && merge_stone(aa_ref(stone_array, i, j), stone)
}

function is_next_move(move) {
    [i, j] = move2idx(move); return (i >= 0) && (aa_ref(R.stones, i, j) || {}).next_move
}

function latest_move(moves, show_until) {
    if (!moves) {return false}
    const n = moves.findIndex(z => (z.move_count > show_until))
    return n >= 0 ? moves[n - 1] : last(moves)
}

// visits & winrate

function suggest_texts(suggest) {
    const conv = (key, digits) => f2s(suggest[key], digits), prior = conv('prior', 3)
    const score = conv('score_without_komi', 2), score_stdev = conv('scoreStdev', 2)
    // need ' ' because '' is falsy
    return suggest.visits === 0 ? [' ', '', prior] :
        ['' + to_i(suggest.winrate) + '%', kilo_str(suggest.visits), prior,
         score, score_stdev]
}

function b_winrate(nth_prev) {return winrate_history_ref('r', nth_prev)}
function winrate_history_ref(key, nth_prev) {
    const [whs, rest] = R.winrate_history_set
    const winrate_history = !truep(nth_prev) ? R.winrate_history :
          (whs.length > 1 && !R.bturn) ? whs[1] : whs[0]
    return (winrate_history[R.move_count - (nth_prev || 0)] || {})[key]
}

function flip_maybe(x, bturn) {
    return (bturn === undefined ? R.bturn : bturn) ? x : 100 - x
}

// previously expected move

function expected_pv() {return ((R.previous_suggest || {}).pv || []).slice(1)}

function set_expected_stone(expected_move, unexpected_move, displayed_stones) {
    merge_stone_at(expected_move, displayed_stones, {expected_move: true})
    merge_stone_at(unexpected_move, displayed_stones, {unexpected_move: true})
}

// math

function tics_until(max) {
    const v = Math.pow(10, Math.floor(log10(max)))
    const unit_v = (max > v * 5) ? v * 2 : (max > v * 2) ? v : v / 2
    return seq(to_i(max / unit_v + 2)).map(k => unit_v * k)  // +1 for margin
}

function log10(z) {return Math.log(z) / Math.log(10)}

// [0,1,2,3,4,5,6,7,8,9,10,11,12].map(k => kilo_str(10**k))  ==>
// ['1','10','100','1.0K','10K','100K','1.0M','10M','100M','1.0G','10G','100G','1000G']
function kilo_str(x) {
    return kilo_str_sub(x, [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']])
}
function kilo_str_sub(x, rules) {
    if (empty(rules)) {return to_s(x)}
    const [[base, unit], ...rest] = rules
    if (x < base) {return kilo_str_sub(x, rest)}
    // +0.1 for "1.0K" instead of "1K"
    const y = (x + 0.1) / base, z = Math.floor(y)
    return (y < 10 ? to_s(y).slice(0, 3) : to_s(z)) + unit
}

//////////////////////////////////

module.exports = {
    set_state,
    draw_raw_goban, draw_main_goban, draw_goban_with_principal_variation,
    draw_endstate_goban,
    draw_winrate_graph, draw_winrate_bar, draw_visits_trail, draw_zone_color_chart,
    update_winrate_trail, clear_canvas, is_next_move, latest_move,
    target_move: () => target_move,
}
