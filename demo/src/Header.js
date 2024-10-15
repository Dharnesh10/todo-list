import React from 'react'

const Header = (props) => {

  return (
    <header>
        <h1>To Do List</h1>
    </header>
  )
}

Header.defaultProps = {
  title: "To Do List" // to set a default title
}
export default Header