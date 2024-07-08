import request from "./request"

export const getUserList = (page, pageSize, keyword = '') => {
    return request.p('/admin/users', {
        page,
        pageSize,
        keyword
    })
}

export const addUserToBlacklist = (userId) => {
    return request.p('/admin/blacklist/add', {
        userId
    })
}

export const removeUserFromBlacklist = (userId) => {
    return request.p('/admin/blacklist/remove', {
        userId
    })
}
