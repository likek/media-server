import videojs from 'video.js'

const MenuButton = videojs.getComponent("MenuButton")
const MenuItem = videojs.getComponent("MenuItem")

class SourceMenuItem extends MenuItem {
  constructor(player, options) {
    super(player, options)
  }

  handleClick(event) {
    const childNodes = this.el_.parentNode.children
    const selected = this.options_
    const levels = this.player().qualityLevels()

    for (let j = 0; j < childNodes.length; j++) {
      childNodes[j].classList.remove("vjs-selected")
    }

    for (let i = 0; i < levels.length; i++) {
      levels[i].enabled_(false)
      if (selected.index === levels.length) {
        levels[i].enabled_(true)
      } else if (selected.index === i) {
        levels[i].enabled_(true)
      }
    }

    super.handleClick(event)
  }

  buildCSSClass() {
    return `vjs-chapters-button ${super.buildCSSClass()}`
  }
}

class SourceMenuButton extends MenuButton {
  createEl() {
    return videojs.dom.createEl('div', {
      className: 'vjs-http-source-selector vjs-menu-button vjs-menu-button-popup vjs-control vjs-button'
    })
  }

  buildCSSClass() {
    return super.buildCSSClass() + ' vjs-icon-cog'
  }

  createItems() {
    const levels = this.player().qualityLevels()
    const items = []
    const labels = []

    for (let i = 0; i < levels.length; i++) {
      const index = levels.length - (i + 1)
      let label = index.toString()
      let sortVal = index

      if (levels[index].height) {
        label = levels[index].height + "p"
        sortVal = parseInt(levels[index].height, 10)
      } else if (levels[index].bitrate) {
        label = Math.floor(levels[index].bitrate / 1e3) + " kbps"
        sortVal = parseInt(levels[index].bitrate, 10)
      }

      if (labels.includes(label)) continue
      labels.push(label)

      items.push(new SourceMenuItem(this.player_, {
        label,
        index,
        selected: index === levels.selectedIndex,
        sortVal,
        selectable: true,
        multiSelectable: false
      }))
    }

    if (levels.length > 1) {
      items.push(new SourceMenuItem(this.player_, {
        label: 'Auto',
        index: levels.length,
        selected: false,
        sortVal: 99999,
        selectable: true,
        multiSelectable: false
      }))
    }

    return items.sort((a, b) => b.options_.sortVal - a.options_.sortVal)
  }
}

videojs.registerComponent('SourceMenuItem', SourceMenuItem)
videojs.registerComponent('SourceMenuButton', SourceMenuButton)

export default function httpSourceSelector(options = {}) {
  this.ready(() => {
    this.addClass('vjs-http-source-selector')

    if (this.techName_ !== 'Html5') return

    this.on('loadedmetadata', () => {
      if (this.videojs_http_source_selector_initialized) return
      this.videojs_http_source_selector_initialized = true

      const controlBar = this.controlBar
      const fullscreenToggle = controlBar.getChild('fullscreenToggle').el()
      controlBar.addChild('SourceMenuButton', {}, controlBar.children().length - 1)
    })
  })
}