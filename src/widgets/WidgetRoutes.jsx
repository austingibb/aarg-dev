import { Routes, Route } from 'react-router-dom'
import App from '../App.jsx'
import Blog from '../Blog.jsx'
import BlogPost from '../BlogPost.jsx'
import Login from '../Login.jsx'
import Clip from '../Clip.jsx'
import ClipView from '../ClipView.jsx'
import Admin from '../Admin.jsx'
import Shorten from '../Shorten.jsx'
import PathResolver from '../PathResolver.jsx'
import { widgetRoutes } from './registry.js'

const components = {
  home: App,
  blog: Blog,
  'blog-post': BlogPost,
  login: Login,
  clip: Clip,
  'clip-view': ClipView,
  admin: Admin,
  shorten: Shorten,
}

export default function WidgetRoutes() {
  return (
    <Routes>
      {widgetRoutes.map(({ id, path }) => {
        const Component = components[id]
        return <Route key={path} path={path} element={<Component />} />
      })}
      {/* Dynamic URLs may resolve the private hunt. Never enumerate it as a widget. */}
      <Route path="/s/:path" element={<PathResolver shortOnly />} />
      <Route path="/:path" element={<PathResolver />} />
    </Routes>
  )
}
