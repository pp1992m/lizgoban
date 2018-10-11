// -*- coding: utf-8 -*-

/////////////////////////////////////////////////
// setup

// util
function Q(x) {return document.querySelector(x)}
const electron = require('electron'), ipc = electron.ipcRenderer
const {to_i, to_f, xor, truep, merge, empty, last, flatten, each_key_value, array2hash, seq, do_ntimes, deferred_procs}
      = require('./util.js')
const {idx2move, move2idx, idx2coord_translator_pair, uv2coord_translator_pair,
       board_size, sgfpos2move, move2sgfpos} = require('./coord.js')
const current_window = electron.remote.getCurrentWindow()

// canvas
const main_canvas = Q('#goban'), sub_canvas = Q('#sub_goban')
const winrate_bar_canvas = Q('#winrate_bar'), winrate_graph_canvas = Q('#winrate_graph')

// color constant
const BLACK = "#000", WHITE = "#fff"
const GRAY = "#ccc", DARK_GRAY = "#444"
const RED = "#f00", GREEN = "#0c0", BLUE = "#88f", YELLOW = "#ff0"
const ORANGE = "#fc8d49"
const DARK_YELLOW = "#c9a700", TRANSPARENT = "rgba(0,0,0,0)"
const MAYBE_BLACK = "rgba(0,0,0,0.5)", MAYBE_WHITE = "rgba(255,255,255,0.5)"
const PALE_BLUE = "rgba(128,128,255,0.3)"
const PALE_BLACK = "rgba(0,0,0,0.1)", PALE_WHITE = "rgba(255,255,255,0.3)"
const PALE_RED = "rgba(255,0,0,0.1)", PALE_GREEN = "rgba(0,255,0,0.1)"
// p: pausing, t: trial
const GOBAN_BG_COLOR = {"": "#f9ca91", p: "#a38360", t: "#f7e3cd", pt: "#a09588"}

// renderer state
const R = {
    stones: [], move_count: 0, bturn: true, history_length: 0, suggest: [], playouts: 1,
    min_winrate: 50, max_winrate: 50, winrate_history: [],
    attached: false, pausing: false, auto_analyzing: false,
    auto_analysis_playouts: Infinity,
    sequence_cursor: 1, sequence_length: 1, sequence_ids: [],
    history_tags: [],
    tag_letters: '',
}
let temporary_board_type = false
let hovered_suggest = null, keyboard_moves = [], keyboard_tag_data = {}
let verbose = false
let thumbnails = []

// handler
window.onload = window.onresize = update
function update()  {set_all_canvas_size(); update_goban()}

/////////////////////////////////////////////////
// util

function setq(x, val) {Q(x).textContent = val}
function setdebug(x) {setq('#debug', JSON.stringify(x))}
const f2s = (new Intl.NumberFormat(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 1})).format

// for debug from Developper Tool
function send_to_leelaz(cmd) {main('send_to_leelaz', cmd)}

/////////////////////////////////////////////////
// action

function new_window() {main('new_window', R.board_type === 'suggest' ? 'variation' : 'suggest')}
function toggle_auto_analyze() {
    main('toggle_auto_analyze', auto_analysis_playouts_setting())
}
function toggle_auto_analyze_playouts() {
    R.auto_analyzing ? toggle_auto_analyze() : Q('#auto_analysis_playouts').select()
}
function auto_analysis_playouts_setting () {
    return to_i(Q('#auto_analysis_playouts').value)
}

function start_auto_play() {
    main('auto_play', to_f(Q('#auto_play_sec').value)); hide_dialog()
}

function set_weaken_percent() {
    main('set_weaken_percent', to_f(Q('#weaken_percent').value)); hide_dialog()
}

function show_dialog(name) {
    Q(name).style.visibility = "visible"; Q(`${name} input`).select()
}
function hide_dialog() {
    document.querySelectorAll(".dialog").forEach(d => d.style.visibility = "hidden")
}

function play_moves(moves) {
    moves && moves.forEach((move, k) => main('play', move, false,
                                             (k === 0) && R.start_moves_tag_letter))
}

function main(channel, ...args) {ipc.send(channel, ...args)}

/////////////////////////////////////////////////
// from main

ipc.on('render', (e, h) => {
    merge(R, h)
    setq('#move_count', R.move_count)
    setq('#history_length', ' (' + R.history_length + ')')
    update_goban()
})

ipc.on('update_ui', (e, availability, ui_only, board_type) => {
    R.pausing = availability.resume
    R.auto_analyzing = availability.stop_auto
    merge(R, {board_type})
    ui_only || update_goban()
    update_body_color()
    update_button_etc(availability)
    update_board_type()
    update_all_thumbnails()
    update_title()
    try_thumbnail()
})

ipc.on('ask_auto_play_sec', (e) => show_dialog('#auto_play_sec_dialog'))
ipc.on('ask_weaken_percent', (e) => show_dialog('#weaken_percent_dialog'))

ipc.on('slide_in', (e, direction) => slide_in(direction))

let last_title = ''
function update_title() {
    const b = R.player_black, w = R.player_white
    const n = x => x || '?'
    const names = (b || w) ? `(B: ${n(b)} / W: ${n(w)})` : ''
    const tags = current_tag_letters()
    const tag_text = tags ? `[${tags}]` : ''
    const title = `LizGoban ${names} ${tag_text}`
    if (title !== last_title) {current_window.setTitle(title); last_title = title}
}

function b_winrate() {return winrate_history_ref('r')}
function last_move_b_eval() {return winrate_history_ref('move_b_eval')}
function last_move_eval() {return winrate_history_ref('move_eval')}
function winrate_history_ref(key) {return (R.winrate_history[R.move_count] || {})[key]}
function current_tag_letters() {return R.history_tags.map(x => x.tag).join('')}

function update_body_color() {
    [Q('#body').style.color, Q('#body').style.backgroundColor] =
        R.attached ? ['white', '#111'] :
        R.auto_analyzing ? ['black', '#aaa'] : ['white', '#444']
}

/////////////////////////////////////////////////
// draw goban etc.

function update_goban() {
    const btype = current_board_type(), do_nothing = truep
    const draw_raw_unclickable = c => draw_goban(c, null, {draw_last_p: true, read_only: true})
    const draw_raw_clickable = c => draw_goban(c, null, {draw_playouts_p: true})
    const f = (m, w, s) => (m(main_canvas),
                            (w || draw_winrate_graph)(winrate_graph_canvas),
                            (s || do_nothing)(sub_canvas),
                            draw_winrate_bar(winrate_bar_canvas))
    if (R.board_type === "double_boards") {
        switch (btype) {
        case "winrate_only":
            f(draw_winrate_graph, draw_raw_unclickable, draw_main_goban); break;
        case "raw":
            f(draw_raw_clickable, null, draw_goban_with_principal_variation); break;
        default:
            f(draw_main_goban, null, draw_goban_with_principal_variation); break;
        }
    } else {
        switch (btype) {
        case "winrate_only": f(draw_winrate_graph, draw_raw_unclickable); break;
        case "raw": f(draw_raw_clickable); break;
        case "variation": f(draw_goban_with_principal_variation); break;
        case "suggest": default: f(draw_main_goban); break;
        }
    }
}

function draw_main_goban(canvas) {
    const hovered_move = canvas.lizgoban_hovered_move
    const kbd_move = keyboard_moves[0]
    const h = hovered_suggest =
          R.suggest.find(h => h.move === kbd_move || h.move === hovered_move)
    const opts = {draw_playouts_p: true, read_only: R.attached}
    // case I: "variation"
    if (h) {draw_goban_with_variation(canvas, h, opts); return}
    // case II: "suggest" or "until"
    const [i, j] = kbd_move ? move2idx(kbd_move) :
          hovered_move ? move2idx(hovered_move) : [-1, -1]
    const s = (i >= 0 && R.stones[i] && R.stones[i][j]) || {}
    const show_until = keyboard_tag_data.move_count ||
          (s.stone && s.tag && (s.move_count !== R.move_count) && s.move_count)
    show_until ? draw_goban_until(canvas, show_until, opts)
        : draw_goban_with_suggest(canvas, opts)
}

function draw_goban_until(canvas, show_until, opts) {
    const displayed_stones = copy_stones_for_display()
    const latest_move = ss => {
        const n = ss.findIndex(z => (z.move_count > show_until))
        return n >= 0 ? ss[n - 1] : last(ss)
    }
    each_stone(displayed_stones, (h, idx) => {
        const ss = h.anytime_stones, target = ss && latest_move(ss)
        if (target) {
            h.black = target.is_black; h.last = (target.move_count === show_until)
            h.displayed_colors =
                h.last ? [BLACK, WHITE] :
                h.stone ? [MAYBE_BLACK, MAYBE_WHITE] : [PALE_BLACK, PALE_WHITE]
        }
        h.stone = !!target; h.displayed_tag = h.tag
    })
    draw_goban(canvas, displayed_stones, {draw_last_p: true, ...opts})
}

function draw_goban_with_suggest(canvas, opts) {
    const displayed_stones = copy_stones_for_display()
    R.suggest.forEach(h => set_stone_at(h.move, displayed_stones, {suggest: true, data: h}))
    each_stone(displayed_stones, (h, idx) => (h.displayed_tag = h.tag && h.stone))
    draw_goban(canvas, displayed_stones,
               {draw_last_p: true, draw_next_p: true, ...opts})
}

function draw_goban_with_variation(canvas, suggest, opts) {
    const variation = suggest.pv || []
    const displayed_stones = copy_stones_for_display()
    canvas === main_canvas && (hovered_suggest = suggest)
    variation.forEach((move, k) => {
        const b = xor(R.bturn, k % 2 === 1), w = !b
        set_stone_at(move, displayed_stones, {
            stone: true, black: b, white: w,
            variation: true, movenums: [k + 1], variation_last: k === variation.length - 1
        })
    })
    const [winrate_text, playouts_text] = suggest_texts(suggest) || []
    const mapping_text =
          winrate_text && (canvas === main_canvas) ?
          `${winrate_text} (${playouts_text})` : undefined
    const mapping_text_at = flip_maybe(suggest.winrate)
    draw_goban(canvas, displayed_stones,
               {draw_last_p: true, mapping_text, mapping_text_at, ...opts})
}

function draw_goban_with_principal_variation(canvas) {
    draw_goban_with_variation(canvas, R.suggest[0] || {}, {read_only: true})
}

function copy_stones_for_display() {
    return R.stones.map(row => row.map(s => merge({}, s)))
}

function each_stone(stones, proc) {
    stones.forEach((row, i) => row.forEach((h, j) => proc(h, [i, j])))
}

function set_stone_at(move, stone_array, stone) {
    const get_movenums = s => s.movenums || []
    const ary_or_undef = a => empty(a) ? undefined : a
    const merge_stone = (stone0, stone1) =>
        merge(stone0, stone1,
              {movenums: ary_or_undef(flatten([stone0, stone1].map(get_movenums)))})
    // do nothing if move is pass
    const [i, j] = move2idx(move); (i >= 0) && merge_stone(stone_array[i][j], stone)
}

function draw_goban(canvas, stones, opts) {
    const {draw_last_p, draw_next_p, draw_playouts_p, read_only,
           mapping_text, mapping_text_at} = opts || {}
    const margin = canvas.height * 0.05
    const g = canvas.getContext("2d"); g.lizgoban_canvas = canvas
    const [idx2coord, coord2idx] = idx2coord_translator_pair(canvas, margin, margin, true)
    const unit = idx2coord(0, 1)[0] - idx2coord(0, 0)[0]
    const hovered_move = canvas.lizgoban_hovered_move
    // clear
    g.strokeStyle = BLACK; g.fillStyle = goban_bg(); g.lineWidth = 1
    edged_fill_rect([0, 0], [canvas.width, canvas.height], g)
    // draw
    draw_grid(unit, idx2coord, g)
    draw_playouts_p && draw_playouts(margin, canvas, g)
    mapping_text && draw_mapping_text(mapping_text, mapping_text_at, margin, canvas, g)
    !read_only && hovered_move && draw_cursor(hovered_move, unit, idx2coord, g)
    draw_on_board(stones || R.stones,
                  draw_last_p, draw_next_p, unit, idx2coord, g)
    // mouse events
    canvas.onmousedown = e => (!read_only && !R.attached &&
                               (play_here(e, coord2idx), hover_off(canvas)))
    canvas.onmousemove = e => hover_here(e, coord2idx, canvas)
    canvas.onmouseleave = e => hover_off(canvas)
}

function draw_grid(unit, idx2coord, g) {
    g.strokeStyle = BLACK; g.fillStyle = BLACK; g.lineWidth = 1
    seq(board_size).forEach(i => {
        line(idx2coord(i, 0), idx2coord(i, board_size - 1), g)
        line(idx2coord(0, i), idx2coord(board_size - 1, i), g)
    })
    const star_radius = unit * 0.1, stars = [3, 9, 15]
    stars.forEach(i => stars.forEach(j => fill_circle(idx2coord(i, j), star_radius, g)))
}

function draw_playouts(margin, canvas, g) {
    if (!truep(R.playouts)) {return}
    draw_playouts_text(margin, canvas, g)
    draw_progress(margin, canvas, g)
}

function draw_playouts_text(margin, canvas, g) {
    g.save()
    g.fillStyle = verbose ? BLACK : PALE_BLACK; set_font(margin / 3, g)
    g.textAlign = 'left'; g.textBaseline = 'middle'
    g.fillText(`  playouts = ${R.playouts}`, 0, margin / 4)
    g.restore()
}

function draw_progress(margin, canvas, g) {
    if (R.progress < 0) {return}
    g.fillStyle = R.bturn ? BLACK : WHITE
    fill_rect([0, canvas.height - margin / (verbose ? 10 : 24)],
              [canvas.width * R.progress, canvas.height], g)
}

function draw_mapping_text(text, at, margin, canvas, g) {
    g.fillStyle = RED; set_font(margin / 3, g)
    g.textAlign = at < 10 ? 'left' : at < 90 ? 'center' : 'right'
    g.fillText(text, canvas.width * at / 100, canvas.height - margin / 6)
}

function draw_cursor(hovered_move, unit, idx2coord, g) {
    const xy = idx2coord(...move2idx(hovered_move))
    g.fillStyle = R.bturn ? PALE_BLACK : PALE_WHITE
    fill_circle(xy, unit / 4, g)
}

function draw_on_board(stones, draw_last_p, draw_next_p,
                       unit, idx2coord, g) {
    const stone_radius = unit * 0.5
    const each_coord =
          proc => each_stone(stones, (h, idx) => proc(h, idx2coord(...idx)))
    each_coord((h, xy) => {
        h.stone ? draw_stone(h, xy, stone_radius, draw_last_p, g) :
            h.suggest ? draw_suggest(h, xy, stone_radius, g) : null
        draw_next_p && h.next_move && draw_next_move(h, xy, stone_radius, g)
        h.displayed_tag && draw_tag(h.tag, xy, stone_radius, g)
    })
    each_coord((h, xy) => h.suggest && draw_winrate_mapping_line(h, xy, unit, g))
}

function goban_bg() {
    return GOBAN_BG_COLOR[(R.pausing ? 'p' : '') + (R.trial ? 't' : '')]
}

function current_board_type() {
    return (temporary_board_type === R.board_type && R.board_type === "raw") ?
        "suggest" : (temporary_board_type || R.board_type)
}

function set_temporary_board_type(btype, btype2) {
    const b = (R.board_type === btype) ? btype2 : btype
    if (temporary_board_type === b) {return}
    temporary_board_type = b; update_board_type()
}

let board_type_before_toggle = "double_boards"
function toggle_raw_board() {
    [R.board_type, board_type_before_toggle] = (R.board_type === "raw") ?
        [board_type_before_toggle, "raw"] : ["raw", R.board_type]
    update_board_type()
    current_window.lizgoban_board_type = R.board_type; main('update_menu')
}

/////////////////////////////////////////////////
// mouse action

function play_here(e, coord2idx) {
    const move = mouse2move(e, coord2idx); if (!move) {return}
    const another_board = e.ctrlKey
    goto_idx_maybe(move2idx(move), another_board) ||
        main('play', move, !!another_board)
}

function hover_here(e, coord2idx, canvas) {
    verbose = (canvas === main_canvas)
    const old = canvas.lizgoban_hovered_move
    canvas.lizgoban_hovered_move = mouse2move(e, coord2idx)
    if (canvas.lizgoban_hovered_move != old) {update_goban()}
}

function hover_off(canvas) {
    verbose = false
    canvas.lizgoban_hovered_move = undefined; update_goban()
}

function mouse2coord(e) {
    const bbox = e.target.getBoundingClientRect()
    return [e.clientX - bbox.left, e.clientY - bbox.top]
}

function mouse2idx(e, coord2idx) {
    const [i, j] = coord2idx(...mouse2coord(e))
    return (0 <= i && i < board_size && 0 <= j && j < board_size) && [i, j]
}

function mouse2move(e, coord2idx) {
    const idx = mouse2idx(e, coord2idx); return idx && idx2move(...idx)
}

function goto_idx_maybe(idx, another_board) {
    const [i, j] = idx, s = (i >= 0) ? R.stones[i][j] : {}
    return s.stone && s.tag &&
        (duplicate_if(another_board), main('goto_move_count', s.move_count - 1), true)
}

function duplicate_if(x) {x && main('duplicate_sequence')}

main_canvas.addEventListener("wheel", e => {
    (e.deltaY !== 0) && (e.preventDefault(), main(e.deltaY < 0 ? 'undo' : 'redo'))
})

/////////////////////////////////////////////////
// draw parts

function draw_stone(h, xy, radius, draw_last_p, g) {
    const [b_color, w_color] = h.displayed_colors ||
          (h.maybe ? [MAYBE_BLACK, MAYBE_WHITE] :
           h.maybe_empty ? [PALE_BLACK, PALE_WHITE] : [BLACK, WHITE])
    g.lineWidth = 1; g.strokeStyle = b_color
    g.fillStyle = h.black ? b_color : w_color
    edged_fill_circle(xy, radius, g)
    h.movenums && draw_movenums(h, xy, radius, g)
    draw_last_p && h.last && draw_last_move(h, xy, radius, g)
}

function draw_movenums(h, xy, radius, g) {
    const movenums = h.movenums.slice().sort((a, b) => a - b)
    const color = (movenums[0] === 1) ? GREEN : h.variation_last ? RED :
          (!h.black ? BLACK : WHITE)
    draw_text_on_stone(movenums.join(','), color, xy, radius, g)
}

function draw_tag(tag, xy, radius, g) {
    draw_text_on_stone(tag, BLUE, xy, radius, g)
}

function draw_text_on_stone(text, color, xy, radius, g) {
    const l = text.length, [x, y] = xy, max_width = radius * 1.5
    const fontsize = to_i(radius * (l < 3 ? 1.8 : l < 6 ? 1.2 : 0.9))
    g.save()
    set_font(fontsize, g); g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillStyle = color; g.fillText(text, x, y, max_width)
    g.restore()
}

function draw_last_move(h, xy, radius, g) {
    g.strokeStyle = h.black ? WHITE : BLACK; g.lineWidth = 2
    circle(xy, radius * 0.8, g)
}

function draw_next_move(h, xy, radius, g) {
    g.strokeStyle = h.next_is_black ? BLACK : WHITE; g.lineWidth = 3; circle(xy, radius, g)
}

// suggest_as_stone = {suggest: true, data: suggestion_data}
// See "suggestion reader" section in engine.js for suggestion_data.

function draw_suggest(h, xy, radius, g) {
    const epsilon = 1e-8, green_hue = 120
    const c = (h.data.winrate - R.min_winrate + epsilon) / (R.max_winrate - R.min_winrate + epsilon)
    const hue = to_i(green_hue * c)
    const max_alpha = 0.5
    const playouts_ratio = h.data.visits / (R.playouts + 1)
    const alpha_emphasis = emph => max_alpha * playouts_ratio ** (1 - emph)
    const hsl_e = (h, s, l, emphasis) => hsla(h, s, l, alpha_emphasis(emphasis))
    g.lineWidth = 1
    g.strokeStyle = hsl_e(hue, 100, 20, 0.85); g.fillStyle = hsl_e(hue, 100, 50, 0.4)
    edged_fill_circle(xy, radius, g)
    if (R.lizzie_style) {
        const [x, y] = xy, max_width = radius * 1.8
        const fontsize = to_i(radius * 0.8), next_y = y + fontsize
        const normal_color = hsl_e(0, 0, 0, 0.75), champ_color = RED
        const [winrate_text, playouts_text] = suggest_texts(h.data)
        g.strokeStyle = hsl_e(0, 0, 0, 0.75)
        g.fillStyle = h.data.winrate_order === 0 ? champ_color : normal_color
        set_font(fontsize, g); g.textAlign = 'center'
        g.fillText(winrate_text, x, y, max_width)
        g.fillStyle = h.data.order === 0 ? champ_color : normal_color
        g.fillText(playouts_text, x, next_y , max_width)
    }
    (verbose || !R.lizzie_style) &&
        draw_suggestion_order(h, xy, radius, g.strokeStyle, g)
}

function suggest_texts(suggest) {
    return ['' + to_i(suggest.winrate) + '%', kilo_str(suggest.visits)]
}

function draw_winrate_mapping_line(h, xy, unit, g) {
    const canvas = g.lizgoban_canvas, b_winrate = flip_maybe(h.data.winrate)
    const x1 = canvas.width * b_winrate / 100, y1 = canvas.height, d = unit * 0.3
    const order = h.next_move ? 0 : Math.min(h.data.order, h.data.winrate_order)
    g.lineWidth = (verbose ? 1.5 : 0.3) / (order * 2 + 1)
    g.strokeStyle = RED
    line(xy, [x1, y1 - d], [x1, y1], g)
}

function draw_suggestion_order(h, xy, radius, color, g) {
    if (h.data.order >= 9) {return}
    const [x, y] = xy, lizzie = R.lizzie_style
    const both_champ = (h.data.order + h.data.winrate_order === 0)
    const either_champ = (h.data.order * h.data.winrate_order === 0)
    const [fontsize, d, w] =
          (lizzie ? [0.8, 0.3, 0.8] :
           both_champ ? [1.5, -0.5, 1.5] : [1, -0.1, 1]).map(c => c * radius)
    g.save()
    g.fillStyle = BLUE
    lizzie && fill_rect([x + d, y - d - w], [x + d + w, y - d], g)
    g.fillStyle = lizzie ? WHITE : either_champ ? RED : color
    set_font(fontsize, g); g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(h.data.order + 1, x + d + w / 2, y - d - w / 2, w)
    g.restore()
}

function flip_maybe(x) {return R.bturn ? x : 100 - x}

function hsla(h, s, l, alpha) {
    return 'hsla(' + h + ',' + s + '%,' + l + '%,' + (alpha === undefined ? 1 : alpha) + ')'
}

// kilo_str(123) = '123'
// kilo_str(1234) = '1.2k'
// kilo_str(12345) = '12k'
function kilo_str(x) {
    const digits = 3, unit = 'k'
    const b = 10**digits, y = x / 10**digits, z = Math.floor(y)
    return x < b ? ('' + x) :
        (x < b * 10 ? ('' + y).slice(0, digits) : '' + z) + unit
}

/////////////////////////////////////////////////
// winrate bar

let winrate_bar_prev = 50

function draw_winrate_bar(canvas) {
    const w = canvas.width, h = canvas.height, g = canvas.getContext("2d")
    const tics = 9
    const xfor = percent => w * percent / 100
    const vline = percent => {const x = xfor(percent); line([x, 0], [x, h], g)}
    const b_wr0 = b_winrate(), b_wr = truep(b_wr0) ? b_wr0 : winrate_bar_prev
    winrate_bar_prev = b_wr
    if (R.pausing && !truep(b_wr0)) {
        draw_winrate_bar_unavailable(w, h, g)
        draw_winrate_bar_tics(0, tics, vline, g)
        return
    }
    draw_winrate_bar_areas(b_wr, w, h, xfor, vline, g)
    draw_winrate_bar_tics(b_wr, tics, vline, g)
    draw_winrate_bar_last_move_eval(b_wr, h, xfor, vline, g)
    draw_winrate_bar_text(w, h, g)
    draw_winrate_bar_suggestions(h, xfor, vline, g)
    canvas.onmouseenter = e => {verbose = true; update_goban()}
    canvas.onmouseleave = e => {verbose = false; update_goban()}
}

function draw_winrate_bar_text(w, h, g) {
    const b_wr = b_winrate(), eval = last_move_eval(), y = h / 2
    if (!truep(b_wr)) {return}
    g.save()
    set_font(h * 0.5, g); g.textBaseline = 'middle'
    const f = (wr, x, color, align, ev) => {
        g.fillStyle = color; g.textAlign = align
        const w = ` ${f2s(wr)}% `
        const e = truep(ev) ? ` (${eval > 0 ? '+' : ''}${f2s(eval)}) ` : ''
        g.fillText(w, x, y - h / 4); g.fillText(e, x, y + h / 4)
    }
    f(b_wr, 0, GREEN, 'left', !R.bturn && eval)
    f(100 - b_wr, w, GREEN, 'right', R.bturn && eval)
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

function draw_winrate_bar_tics(b_wr, tics, vline, g) {
    seq(tics, 1).forEach(i => {
        const r = 100 * i / (tics + 1)
        g.lineWidth = 1; g.strokeStyle = (r < b_wr) ? WHITE : BLACK; vline(r)
    })
    g.lineWidth = 3; g.strokeStyle = (b_wr > 50) ? WHITE : BLACK; vline(50)
}

function draw_winrate_bar_last_move_eval(b_wr, h, xfor, vline, g) {
    const eval = last_move_eval(), b_eval = last_move_b_eval()
    if (!truep(eval)) {return}
    const [x1, x2] = [b_wr, b_wr - b_eval].map(xfor).sort()
    const [stroke, fill] = (eval >= 0 ? [GREEN, PALE_GREEN] : [RED, PALE_RED])
    const lw = g.lineWidth = 3; g.strokeStyle = stroke; g.fillStyle = fill
    edged_fill_rect([x1, lw / 2], [x2, h - lw / 2], g)
}

function draw_winrate_bar_suggestions(h, xfor, vline, g) {
    g.lineWidth = 1
    const wr = flip_maybe(b_winrate())
    const is_next_move = move => {
        [i, j] = move2idx(move); return (i >= 0) && R.stones[i][j].next_move
    }
    R.suggest.forEach(s => {
        const {move, visits, winrate} = s
        // fan
        g.lineWidth = 1; g.strokeStyle = BLUE
        g.fillStyle = (s === hovered_suggest) ? ORANGE :
            is_next_move(move) ? YELLOW : PALE_BLUE
        const x = xfor(flip_maybe(winrate)), y = h / 2
        const radius = Math.sqrt(visits / R.playouts) * h
        const degs = R.bturn ? [150, 210] : [-30, 30]
        edged_fill_fan([x, y], radius, degs, g)
        // vertical line
        g.lineWidth = 3
        g.strokeStyle = (s === hovered_suggest) ? ORANGE :
            is_next_move(move) ? DARK_YELLOW : TRANSPARENT
        vline(flip_maybe(winrate))
    })
}

/////////////////////////////////////////////////
// winrate graph

function draw_winrate_graph(canvas) {
    const w = canvas.width, h = canvas.height, g = canvas.getContext("2d")
    const tics = current_board_type() === 'winrate_only' ? 9 : 9
    const xmargin = w * 0.02, fontsize = to_i(w * 0.04)
    const smax = Math.max(R.history_length, 1)
    // s = move_count, r = winrate
    const [sr2coord, coord2sr] =
          uv2coord_translator_pair(canvas, [0, smax], [100, 0], xmargin, 0)
    clear_canvas(canvas, BLACK, g)
    draw_winrate_graph_frame(w, h, tics, g)
    draw_winrate_graph_move_count(smax, fontsize, sr2coord, g)
    draw_winrate_graph_vline(sr2coord, g)
    draw_winrate_graph_tag(fontsize, sr2coord, g)
    draw_winrate_graph_curve(sr2coord, g)
    canvas.onmousedown = e => !R.attached && winrate_graph_goto(e, coord2sr)
    canvas.onmousemove = e => !R.attached && (e.buttons === 1) && winrate_graph_goto(e, coord2sr)
    canvas.onmouseup = e => main('unset_busy')
}

function draw_winrate_graph_frame(w, h, tics, g) {
    // horizontal lines (tics)
    g.strokeStyle = DARK_GRAY; g.fillStyle = DARK_GRAY; g.lineWidth = 1
    seq(tics, 1).forEach(i => {const y = h * i / (tics + 1); line([0, y], [w, y], g)})
    // // frame
    // g.strokeStyle = GRAY; g.fillStyle = GRAY; g.lineWidth = 1
    // rect([0, 0], [w, h], g)
    // 50% line
    g.strokeStyle = GRAY; g.fillStyle = GRAY; g.lineWidth = 1
    line([0, h / 2], [w, h / 2], g)
}

function draw_winrate_graph_vline(sr2coord, g) {
    const vline = s => line(sr2coord(s, 0), sr2coord(s, 100), g)
    g.strokeStyle = DARK_GRAY; g.fillStyle = DARK_GRAY; g.lineWidth = 1
    vline(R.move_count)
}

function draw_winrate_graph_move_count(smax, fontsize, sr2coord, g) {
    g.strokeStyle = DARK_GRAY; g.fillStyle = DARK_GRAY; g.lineWidth = 1
    set_font(fontsize, g)
    g.textAlign = R.move_count < smax / 2 ? 'left' : 'right'
    g.fillText(' ' + R.move_count + ' ', ...sr2coord(R.move_count, 0))
}

function draw_winrate_graph_curve(sr2coord, g) {
    let prev = null, cur = null
    const draw_predict = (r, s, p) => {
        g.strokeStyle = YELLOW; g.lineWidth = 1; line(sr2coord(s, r), sr2coord(s, p), g)
    }
    R.winrate_history.forEach((h, s) => {
        if (!truep(h.r)) {return}
        truep(h.predict) && draw_predict(h.r, s, h.predict)
        g.strokeStyle = isNaN(h.move_eval) ? GRAY : (h.move_eval < 0) ? RED :
            (s > 0 && !truep(h.predict)) ? YELLOW : GREEN
        g.lineWidth = (s <= R.move_count ? 3 : 1)
        cur = sr2coord(s, h.r); prev && line(prev, cur, g); prev = cur
    })
}

function draw_winrate_graph_tag(fontsize, sr2coord, g) {
    R.winrate_history.forEach((h, s) => {
        if (!h.tag) {return}
        const [x, ymax] = sr2coord(s, 0)
        const [yt, yl] = (h.r < 50 ? [0.05, 0.1] : [0.95, 0.9]).map(c => ymax * c)
        g.save()
        set_font(fontsize, g); g.textAlign = 'center'; g.textBaseline = 'middle'
        g.strokeStyle = BLUE; g.lineWidth = 1; line([x, yl], [x, ymax / 2], g)
        g.fillStyle = BLUE; g.fillText(h.tag, x, yt)
        g.restore()
    })
}

function winrate_graph_goto(e, coord2sr) {
    const [s, r] = coord2sr(...mouse2coord(e))
    s >= 0 && main('busy', 'goto_move_count',
                   Math.max(0, Math.min(s, R.history_length)))
}

/////////////////////////////////////////////////
// thmubnails

// (1) record thumbnail

// To avoid wrong thumbnail recording,
// we require "no command" intervals before and *after* screenshot.

const thumbnail_deferring_millisec = 500

const [try_thumbnail, store_thumbnail_later] =
      deferred_procs([take_thumbnail, thumbnail_deferring_millisec],
                     [store_thumbnail, thumbnail_deferring_millisec])

function take_thumbnail() {
    let fired = false
    main_canvas.toBlob(blob => {
        if (fired) {return}; fired = true  // can be called twice???
        const tags = current_tag_letters()
        const players = (R.player_black || R.player_white) ?
              `${R.player_black || "?"}/${R.player_white || "?"} ` : ''
        const name = (R.trial ? tags : players + tags) +
              ` ${R.move_count}(${R.history_length})`
        store_thumbnail_later(current_sequence_id(), URL.createObjectURL(blob), name)
    }, 'image/jpeg', 0.3)
}

function store_thumbnail(id, url, name) {
    thumbnails[id] = {url, name}; update_all_thumbnails()
}

// (2) show thumbnails

// Try block style first. If it overflows vertically, try inline style.

// Naive calculation of total height is wrong
// because "font-size" seems to have some lower bound.
// (ref) http://www.google.com/search?q=chrome%20minimum%20font%20size%20setting

function update_all_thumbnails(style) {
    discard_unused_thumbnails()
    const div = Q("#thumbnails"), preview = Q("#preview")
    const measurer = Q("#thumb_height_measurer")
    const hide_thumbnails = R.attached || R.sequence_length <= 1 ||
          R.board_type === 'variation' || R.board_type === 'winrate_only'
    const ids = hide_thumbnails ? [] : R.sequence_ids
    div.dataset.style = style || 'block'
    update_thumbnail_containers(ids, measurer)
    update_thumbnail_contents(ids, measurer, preview)
    !empty(ids) && !style && measurer.clientHeight > Q("#goban").clientHeight &&
        update_all_thumbnails('inline')
}

function update_thumbnail_containers(ids, div) {
    while (div.children.length > ids.length) {div.removeChild(div.lastChild)}
    ids.slice(div.children.length)
        .forEach(() => {
            const [box, img] = ['div', 'img'].map(t => document.createElement(t))
            div.appendChild(box); box.appendChild(img)
        })
}

function update_thumbnail_contents(ids, div, preview) {
    ids.forEach((id, n) => {
        const box = div.children[n], img = box.children[0], thumb = thumbnails[id]
        const set_action = (clickp, enter_leave_p) => {
            box.onclick =
                (clickp && (() => !R.attached && (main('nth_sequence', n),
                                                  preview.classList.remove('show'))))
            box.onmouseenter =
                (enter_leave_p && (() => {
                    preview.src = img.src; preview.classList.add('show')
                }))
            box.onmouseleave =
                (enter_leave_p && (() => preview.classList.remove('show')))
        }
        const set_current = () => box.classList.add('current')
        const unset_current = () => box.classList.remove('current')
        box.classList.add('thumbbox')
        img.src = thumb ? thumb.url : 'no_thumbnail.png'
        id === current_sequence_id() ? (set_current(), set_action()) :
            (unset_current(), set_action(true, true))
        box.dataset.name = (thumb && thumb.name) || ''
        box.dataset.available = yes_no(thumb)
        !thumb && set_action(true)
    })
}

function discard_unused_thumbnails() {
    const orig = thumbnails; thumbnails = []
    R.sequence_ids.forEach(id => (thumbnails[id] = orig[id]))
}

function current_sequence_id() {return R.sequence_ids[R.sequence_cursor]}

function yes_no(z) {return z ? 'yes' : 'no'}

/////////////////////////////////////////////////
// graphics

function clear_canvas(canvas, bg_color, g) {
    canvas.style.background = bg_color
    g.clearRect(0, 0, canvas.width, canvas.height)
}

function line(...args) {
    // usage: line([x0, y0], [x1, y1], ..., [xn, yn], g)
    const g = args.pop(), [[x0, y0], ...xys] = args
    g.beginPath(); g.moveTo(x0, y0); xys.forEach(xy => g.lineTo(...xy)); g.stroke()
}

function drawers_trio(gen) {
    const edged = (...a) => {gen(...a); last(a).stroke()}
    const filled = (...a) => {gen(...a); last(a).fill()}
    const both = (...a) => {filled(...a); edged(...a)}
    return [edged, filled, both]
}

function rect_gen([x0, y0], [x1, y1], g) {g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0)}
function circle_gen([x, y], r, g) {g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI)}
function fan_gen([x, y], r, [deg1, deg2], g) {
    g.beginPath(); g.moveTo(x, y)
    g.arc(x, y, r, deg1 * Math.PI / 180, deg2 * Math.PI / 180); g.closePath()
}

const [rect, fill_rect, edged_fill_rect] = drawers_trio(rect_gen)
const [circle, fill_circle, edged_fill_circle] = drawers_trio(circle_gen)
const [fan, fill_fan, edged_fill_fan] = drawers_trio(fan_gen)

function set_font(fontsize, g) {g.font = '' + fontsize + 'px sans-serif'}

/////////////////////////////////////////////////
// canvas

function set_all_canvas_size() {
    const main_size = Q('#main_div').clientWidth
    const rest_size = Q('#rest_div').clientWidth
    const main_board_ratio = 0.96, main_board_size = main_size * main_board_ratio
    const sub_board_size = Math.min(main_board_size * 0.65, rest_size * 0.85)
    // use main_board_ratio in winrate_graph_width for portrait layout
    const winrate_graph_width = rest_size * main_board_ratio
    const winrate_graph_height = main_board_size * 0.25
    set_canvas_square_size(main_canvas, main_board_size)
    set_canvas_size(winrate_bar_canvas,
                    main_board_size, main_size * (1 - main_board_ratio))
    set_canvas_square_size(sub_canvas, sub_board_size)
    set_canvas_size(winrate_graph_canvas,
                    winrate_graph_width, winrate_graph_height)
    update_all_thumbnails()
}

function set_canvas_square_size(canvas, size) {set_canvas_size(canvas, size, size)}

function set_canvas_size(canvas, width, height) {
    canvas.setAttribute('width', width); canvas.setAttribute('height', height)
}

/////////////////////////////////////////////////
// keyboard operation

document.onkeydown = e => {
    const key = (e.ctrlKey ? 'C-' : '') + e.key
    const escape = (key === "Escape" || key === "C-[")
    if (escape) {hide_dialog()}
    switch (key === "Enter" && e.target.id) {
    case "auto_analysis_playouts": toggle_auto_analyze(); return
    case "auto_play_sec": start_auto_play(); return
    case "weaken_percent": set_weaken_percent(); return
    }
    if (e.target.tagName === "INPUT" && e.target.type !== "button") {
        escape && e.target.blur(); return
    }
    const f = (g, ...a) => (e.preventDefault(), g(...a)), m = (...a) => f(main, ...a)
    if (to_i(key) > 0) {f(set_keyboard_moves_maybe, to_i(key) - 1)}
    if (key.length === 1 && R.tag_letters.indexOf(key) >= 0) {
        f(set_keyboard_tag_maybe, key)
    }
    const play_it = (steps, another_board) =>
          keyboard_moves[0] ? m('play', keyboard_moves[0], another_board) :
          keyboard_tag_data.move_count ? (duplicate_if(another_board),
                                          m('goto_move_count',
                                            keyboard_tag_data.move_count - 1)) :
          truep(steps) ? m('play_best', steps) :
          !empty(R.suggest) ? m('play', R.suggest[0].move, another_board) : false
    switch (key) {
    case "C-c": m('copy_sgf_to_clipboard'); return
    case "z": f(set_temporary_board_type, "raw", "suggest"); return
    case "x": f(set_temporary_board_type, "winrate_only", "suggest"); return
    case " ": m('toggle_pause'); return
    case "Z": f(toggle_raw_board); return
    }
    const busy = (...a) => m('busy', ...a)
    switch (!R.attached && key) {
    case "C-v": m('paste_sgf_from_clipboard'); break;
    case "C-x": m('cut_sequence'); break;
    case "C-w": m('close_window_or_cut_sequence'); break;
    case "ArrowLeft": case "ArrowUp":
        busy('undo_ntimes', e.shiftKey ? 15 : 1); break;
    case "ArrowRight": case "ArrowDown":
        busy('redo_ntimes', e.shiftKey ? 15 : 1); break;
    case "[": m('previous_sequence'); break;
    case "]": m('next_sequence'); break;
    case "p": m('pass'); break;
    case "Enter": play_it(e.shiftKey ? 5 : 1); break;
    case "`": f(play_it, false, true); break;
    case "Tab": f(play_moves, keyboard_moves[0] ? keyboard_moves : R.suggest[0].pv);
        break;
    case "Backspace": case "Delete": busy('explicit_undo'); break;
    case "Home": m('undo_to_start'); break;
    case "End": m('redo_to_end'); break;
    case "a": f(toggle_auto_analyze_playouts); break;
    case "q": R.trial && m('cut_sequence'); break;
    }
}

document.onkeyup = e => {
    reset_keyboard_moves(); reset_keyboard_tag()
    switch (e.key) {
    case "z": case "x": set_temporary_board_type(false); return
    }
    main('unset_busy')
}

function set_keyboard_moves_maybe(n) {
    const h = R.suggest[n]
    h && !keyboard_moves[0] && (keyboard_moves = h.pv) && update_goban()
}
function reset_keyboard_moves() {keyboard_moves = []; update_goban()}

function set_keyboard_tag_maybe(key) {
    if (keyboard_tag_data.tag) {return}
    const tags = R.history_tags.slice().reverse()
    const data = tags.find(h => h.tag === key && h.move_count <= R.move_count) ||
          tags.find(h => h.tag === key)
    keyboard_tag_data = data || {}
    data && update_goban()
}
function reset_keyboard_tag() {keyboard_tag_data = {}; update_goban()}

/////////////////////////////////////////////////
// controller

// board type selector

function update_board_type() {
    update_ui_element("#sub_goban_container", R.board_type === "double_boards")
    update_goban()
}

// buttons

function update_button_etc(availability) {
    const f = (key, ids) =>
          (ids || key).split(/ /).forEach(x => update_ui_element('#' + x, availability[key]))
    f('undo', 'undo undo_ntimes undo_to_start explicit_undo')
    f('redo', 'redo redo_ntimes redo_to_end')
    f('attach', 'hide_when_attached1 hide_when_attached2'); f('detach')
    f('pause', 'pause play_best play_best_x5'); f('resume')
    f('bturn'); f('wturn'); f('auto_analyze')
    f('start_auto_analyze', 'start_auto_analyze auto_analysis_playouts')
    f('stop_auto')
    f('normal_ui'); f('simple_ui'); f('trial')
}

/////////////////////////////////////////////////
// DOM

function update_ui_element(query_string, val) {
    const elem = Q(query_string), tag = elem.tagName
    switch (tag) {
    case "INPUT": elem.disabled = !val; break
    case "DIV": elem.style.display = (val ? "block" : "none"); break
    case "SPAN": elem.style.display = (val ? "inline" : "none"); break
    case "SELECT": set_selection(elem, val); break
    }
}

function get_selection(elem) {return elem.options[elem.selectedIndex].value}

function set_selection(elem, val) {
    elem.selectedIndex =
        to_i(seq(elem.options.length).find(i => (elem.options[i].value === val)))
}

/////////////////////////////////////////////////
// effect

function slide_in(direction) {
    const shift = {next: '30%', previous: '-30%'}[direction]
    Q('#goban').animate([
        {transform: `translate(0%, ${shift})`, opacity: 0},
        {transform: 'translate(0)', opacity: 1},
    ], 200)
}

/////////////////////////////////////////////////
// init

main('init_from_renderer')

// (ref.)
// https://teratail.com/questions/8773
// https://qiita.com/damele0n/items/f4050649de023a948178
// https://qiita.com/tkdn/items/5be7ee5cc178a62f4f67
Q('body').offsetLeft  // magic spell to get updated clientWidth value
set_all_canvas_size()
