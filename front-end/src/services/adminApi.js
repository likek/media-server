import request from "./request"

export const getUserList = (page, pageSize) => {
    return request.post('/admin/users', {
        page,
        pageSize
    })
}