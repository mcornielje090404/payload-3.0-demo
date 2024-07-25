import path from 'path'
// import { postgresAdapter } from '@payloadcms/db-postgres'
import { en } from 'payload/i18n/en'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  //editor: slateEditor({}),
  editor: lexicalEditor(),
  collections: [
    {
      slug: 'users',
      auth: true,
      access: {
        delete: () => false,
        update: () => false,
      },
      fields: [],
    },
    {
      slug: 'posts',
      hooks: {
        beforeChange: [
          ({ data }) => {
            // Would use a default value but there is another issue I've opened (#7350) with checkbox default values
            if (data?.active === undefined || data?.active === null) {
              data.active = true
            }

            return data
          },
        ],
        afterChange: [
          async ({ previousDoc, doc, operation, req }) => {
            console.log('audit hook running...')

            if (operation === 'update') {
              const { payload } = req

              const isDelete = previousDoc?.active && !doc.active

              let auditType: 'create' | 'update' | 'delete'

              if (isDelete) {
                auditType = 'delete'
              } else {
                auditType = 'update'
              }

              const strippedDoc = {
                title: doc.title,
                contributors: doc.contributors,
                post: doc.id,
              }

              console.log('stripped doc', strippedDoc)

              await payload.create({
                collection: 'post-audits',
                data: { ...strippedDoc, auditType },
                overrideAccess: true,
                user: req.user,
              })

              console.log('audit hook ran')
            }
          },
        ],
      },
      fields: [
        {
          type: 'checkbox',
          name: 'active',
        },
        {
          type: 'text',
          name: 'title',
          required: true,
        },
        {
          type: 'array',
          name: 'contributors',
          minRows: 1,
          fields: [
            {
              type: 'text',
              name: 'role',
              required: true,
            },
            {
              type: 'relationship',
              name: 'user',
              relationTo: 'users',
              required: true,
            },
          ],
        },
      ],
    },
    {
      slug: 'post-audits',
      fields: [
        {
          type: 'text',
          name: 'title',
          required: true,
        },
        {
          type: 'relationship',
          relationTo: 'posts',
          name: 'post',
          required: true,
        },
        {
          type: 'array',
          name: 'contributors',
          fields: [
            {
              type: 'text',
              name: 'role',
              required: true,
            },
            {
              type: 'relationship',
              name: 'user',
              relationTo: 'users',
              required: true,
            },
          ],
        },
        {
          name: 'auditType',
          type: 'select',
          options: [
            { label: 'Create', value: 'create' },
            { label: 'Update', value: 'update' },
            { label: 'Delete', value: 'delete' },
          ],
        },
      ],
    },
  ],
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.POSTGRES_URI || '',
    },
  }),

  /**
   * Payload can now accept specific translations from 'payload/i18n/en'
   * This is completely optional and will default to English if not provided
   */
  i18n: {
    supportedLanguages: { en },
  },

  admin: {
    autoLogin: {
      email: 'dev@payloadcms.com',
      password: 'test',
      prefillOnly: true,
    },
  },
  async onInit(payload) {
    const existingUsers = await payload.find({
      collection: 'users',
      limit: 1,
    })

    if (existingUsers.docs.length === 0) {
      await payload.create({
        collection: 'users',
        data: {
          email: 'dev@payloadcms.com',
          password: 'test',
        },
      })
    }
  },
  // Sharp is now an optional dependency -
  // if you want to resize images, crop, set focal point, etc.
  // make sure to install it and pass it to the config.

  // This is temporary - we may make an adapter pattern
  // for this before reaching 3.0 stable
  sharp,
})
